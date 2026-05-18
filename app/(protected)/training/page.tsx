import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"
import SessionList, { type TrainingSession } from "./_components/SessionList"
import type { TeamOption } from "./_components/RuleBuilder"

export default async function TrainingPage() {
  const supabase = await createClient()

  const [{ data: sessionsRaw }, { data: teamsRaw }] = await Promise.all([
    supabase
      .from("training_sessions")
      .select(`
        id, title, description, location, session_date, session_time,
        max_players, payment_link, payment_amount, eligibility_rules, notes,
        training_signups(
          id,
          players(first_name, last_name),
          parents(first_name, last_name)
        )
      `)
      .order("session_date", { ascending: true }),
    supabase
      .from("teams")
      .select("id, name")
      .order("name", { ascending: true }),
  ])

  const sessions: TrainingSession[] = (sessionsRaw ?? []).map((s: any) => ({
    id:                s.id,
    title:             s.title,
    description:       s.description,
    location:          s.location,
    session_date:      s.session_date,
    session_time:      s.session_time,
    max_players:       s.max_players,
    payment_link:      s.payment_link,
    payment_amount:    s.payment_amount,
    eligibility_rules: s.eligibility_rules as EligibilityRules,
    notes:             s.notes,
    signups:           s.training_signups ?? [],
  }))

  const teams: TeamOption[] = (teamsRaw ?? []).map((t: any) => ({
    id:   t.id,
    name: t.name,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Training Sessions</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Create sessions, set eligibility rules, and track signups.
        </p>
      </div>
      <SessionList initialSessions={sessions} teams={teams} />
    </div>
  )
}
