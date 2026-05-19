import { createClient } from "@/lib/supabase/server"
import type { SkillsSession, SkillsAttempt } from "./actions"
import SkillsHub, { type PlayerOption } from "./_components/SkillsHub"

export default async function SkillsPage() {
  const supabase = await createClient()

  const [{ data: sessionsRaw }, { data: attemptsRaw }, { data: playersRaw }] = await Promise.all([
    supabase
      .from("skills_sessions")
      .select("id, name, session_date, notes, created_at")
      .order("session_date", { ascending: false }),
    supabase
      .from("skills_attempts")
      .select("id, skills_session_id, player_id, course_time_ms, free_throw_makes, hot_shots_8pt, hot_shots_7pt, hot_shots_5pt, hot_shots_3pt, hot_shots_2pt, notes"),
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true }),
  ])

  const sessions = (sessionsRaw ?? []) as SkillsSession[]
  const attempts = (attemptsRaw ?? []) as SkillsAttempt[]
  const players: PlayerOption[] = (playersRaw ?? []).map((p: any) => ({
    id:         p.id,
    first_name: p.first_name,
    last_name:  p.last_name,
  }))

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Skills Competition</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Track player scores for Skills Course, Free Throws, and Hot Shots.
        </p>
      </div>
      <SkillsHub initialSessions={sessions} initialAttempts={attempts} players={players} />
    </div>
  )
}
