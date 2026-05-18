import { redirect } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/server"
import { isPlayerEligible, type EligibilityRules } from "@/lib/training-eligibility"
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
        max_players, payment_link, payment_amount, notes, eligibility_rules,
        training_signups(id, player_id)
      `)
      .gte("session_date", today)
      .order("session_date", { ascending: true }),
  ])

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
      const signups: Array<{ id: string; player_id: string }> = s.training_signups ?? []

      const eligiblePlayers = playerIds
        .map((pid: string) => {
          const player = playerMap.get(pid) as any
          const dob     = player?.date_of_birth ?? null
          const teamIds = playerTeams.get(pid) ?? new Set<string>()
          const eligible = isPlayerEligible(
            s.eligibility_rules as EligibilityRules,
            dob,
            teamIds,
            s.session_date,
          )
          if (!eligible) return null
          const signup = signups.find((su) => su.player_id === pid)
          return {
            player_id:  pid,
            first_name: player?.first_name ?? "",
            last_name:  player?.last_name  ?? "",
            signup_id:  signup?.id ?? null,
          }
        })
        .filter(Boolean) as TrainingSessionForParent["players"]

      if (eligiblePlayers.length === 0) return null

      return {
        id:             s.id,
        title:          s.title,
        description:    s.description,
        location:       s.location,
        session_date:   s.session_date,
        session_time:   s.session_time,
        max_players:    s.max_players,
        payment_link:   s.payment_link,
        payment_amount: s.payment_amount,
        notes:          s.notes,
        total_signups:  signups.length,
        players:        eligiblePlayers,
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
