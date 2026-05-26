import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"
import SessionList, { type TrainingSession, type PlayerOption } from "./_components/SessionList"
import type { TeamOption } from "./_components/RuleBuilder"

export default async function TrainingPage() {
  const supabase = await createClient()

  const [{ data: sessionsRaw }, { data: teamsRaw }, { data: playersRaw }] = await Promise.all([
    supabase
      .from("training_sessions")
      .select(`
        id, title, description, location, session_date, session_time,
        session_end_time, max_players, payment_amount, payment_methods,
        eligibility_rules, notes, series_id,
        training_signups(
          id, player_id, payment_method, paid,
          players(first_name, last_name),
          parents(first_name, last_name)
        )
      `)
      .order("session_date", { ascending: true }),
    supabase
      .from("teams")
      .select("id, name")
      .order("name", { ascending: true }),
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true }),
  ])

  const sessions: TrainingSession[] = (sessionsRaw ?? []).map((s: any) => ({
    id:                s.id,
    title:             s.title,
    description:       s.description,
    location:          s.location,
    location_address:  s.location_address ?? null,
    image_url:         s.image_url        ?? null,
    session_date:      s.session_date,
    session_time:      s.session_time,
    session_end_time:  s.session_end_time,
    max_players:       s.max_players,
    payment_amount:    s.payment_amount,
    payment_methods:   s.payment_methods ?? [],
    eligibility_rules: s.eligibility_rules as EligibilityRules,
    notes:             s.notes,
    series_id:         s.series_id ?? null,
    signups:           s.training_signups ?? [],
  }))

  const teams: TeamOption[] = (teamsRaw ?? []).map((t: any) => ({
    id:   t.id,
    name: t.name,
  }))

  const players: PlayerOption[] = (playersRaw ?? []).map((p: any) => ({
    id:         p.id,
    first_name: p.first_name,
    last_name:  p.last_name,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training Sessions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create sessions, set eligibility rules, and track signups.
        </p>
      </div>
      <SessionList initialSessions={sessions} teams={teams} players={players} />
    </div>
  )
}
