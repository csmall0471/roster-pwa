import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { isPlayerEligible, explainIneligibility, type EligibilityRules } from "@/lib/training-eligibility"
import TrainingList, { type TrainingSessionForParent } from "./_components/TrainingList"

export default async function ParentTrainingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) redirect("/login")

  // Step 1: get parent's player IDs
  const { data: ppRows } = await supabase.rpc("get_my_player_ids")
  const playerIds = (ppRows ?? []).map((r: any) => r.player_id as string)

  // Step 2: load player details, roster, and sessions in parallel
  const today = new Date().toISOString().split("T")[0]

  const [{ data: playersRaw }, { data: rosterRows }, { data: sessionsRaw }] = await Promise.all([
    playerIds.length > 0
      ? supabase
          .from("players")
          .select("id, first_name, last_name, date_of_birth")
          .in("id", playerIds)
      : Promise.resolve({ data: [] }),
    playerIds.length > 0
      ? supabase
          .from("roster")
          .select("player_id, team_id")
          .in("player_id", playerIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("training_sessions")
      .select(`
        id, title, description, location, session_date, session_time,
        session_end_time, max_players, payment_amount, payment_methods,
        notes, eligibility_rules,
        training_signups(id, player_id, payment_method)
      `)
      .gte("session_date", today)
      .order("session_date", { ascending: true }),
  ])

  // Fetch signup player names via security-definer function (bypasses players RLS)
  const sessionIds = (sessionsRaw ?? []).map((s: any) => s.id as string)
  const { data: signupNamesRaw } = sessionIds.length > 0
    ? await supabase.rpc("get_training_signup_names", { p_session_ids: sessionIds })
    : { data: [] }

  // session_id -> [{first_name, last_name}]
  const signupNamesBySession = new Map<string, Array<{ first_name: string; last_name: string }>>()
  for (const row of (signupNamesRaw ?? []) as Array<{ session_id: string; first_name: string; last_name: string }>) {
    if (!signupNamesBySession.has(row.session_id)) signupNamesBySession.set(row.session_id, [])
    signupNamesBySession.get(row.session_id)!.push({ first_name: row.first_name, last_name: row.last_name })
  }

  // Build lookups
  const playerMap = new Map(
    (playersRaw ?? []).map((p: any) => [p.id as string, p])
  )

  const playerTeams = new Map<string, Set<string>>()
  for (const row of rosterRows ?? []) {
    const pid = row.player_id as string
    if (!playerTeams.has(pid)) playerTeams.set(pid, new Set())
    playerTeams.get(pid)!.add(row.team_id as string)
  }

  // Evaluate eligibility and build sessions for this parent
  const sessions: TrainingSessionForParent[] = (sessionsRaw ?? [])
    .map((s: any) => {
      const signups: Array<{ id: string; player_id: string; payment_method: string | null }> =
        s.training_signups ?? []

      const eligiblePlayers: TrainingSessionForParent["players"] = []
      const ineligiblePlayers: TrainingSessionForParent["ineligiblePlayers"] = []

      for (const pid of playerIds as string[]) {
        const player  = playerMap.get(pid) as any
        const dob     = player?.date_of_birth ?? null
        const teamIds = playerTeams.get(pid) ?? new Set<string>()
        const rules   = s.eligibility_rules as EligibilityRules

        if (isPlayerEligible(rules, dob, teamIds, s.session_date)) {
          const signup = signups.find((su) => su.player_id === pid)
          eligiblePlayers.push({
            player_id:      pid,
            first_name:     player?.first_name ?? "",
            last_name:      player?.last_name  ?? "",
            signup_id:      signup?.id ?? null,
            payment_method: signup?.payment_method ?? null,
          })
        } else {
          ineligiblePlayers.push({
            player_id:  pid,
            first_name: player?.first_name ?? "",
            last_name:  player?.last_name  ?? "",
            reason:     explainIneligibility(rules, dob, teamIds, s.session_date),
          })
        }
      }

      if (eligiblePlayers.length === 0 && ineligiblePlayers.length === 0) return null

      const signedUpPlayers: TrainingSessionForParent["signedUpPlayers"] =
        signupNamesBySession.get(s.id) ?? []

      return {
        id:                s.id,
        title:             s.title,
        description:       s.description,
        location:          s.location,
        session_date:      s.session_date,
        session_time:      s.session_time,
        session_end_time:  s.session_end_time,
        max_players:       s.max_players,
        payment_amount:    s.payment_amount,
        payment_methods:   s.payment_methods ?? [],
        notes:             s.notes,
        series_id:         s.series_id ?? null,
        total_signups:     signups.length,
        players:           eligiblePlayers,
        ineligiblePlayers,
        signedUpPlayers,
      }
    })
    .filter(Boolean) as TrainingSessionForParent[]

  return (
    <div>
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mt-4 mb-6">Training</h1>

      {sessions.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No upcoming training sessions available for your players right now.
        </p>
      ) : (
        <TrainingList initialSessions={sessions} />
      )}
    </div>
  )
}
