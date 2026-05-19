import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import type { SkillsSession, SkillsAttempt } from "@/app/(protected)/training/skills/actions"
import ParentSkillsView from "./_components/ParentSkillsView"

export default async function ParentSkillsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) redirect("/login")

  const { data: ppRows } = await supabase.rpc("get_my_player_ids")
  const playerIds = (ppRows ?? []).map((r: any) => r.player_id as string)

  const [{ data: playersRaw }, { data: sessionsRaw }, { data: attemptsRaw }] = await Promise.all([
    playerIds.length > 0
      ? supabase
          .from("players")
          .select("id, first_name, last_name")
          .in("id", playerIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("skills_sessions")
      .select("id, name, session_date, notes, created_at")
      .order("session_date", { ascending: true }),
    playerIds.length > 0
      ? supabase
          .from("skills_attempts")
          .select("id, skills_session_id, player_id, course_time_ms, course_splits, free_throw_makes, hot_shots_8pt, hot_shots_7pt, hot_shots_5pt, hot_shots_3pt, hot_shots_2pt, hot_shots_log, notes")
          .in("player_id", playerIds)
      : Promise.resolve({ data: [] }),
  ])

  const players = (playersRaw ?? []).map((p: any) => ({
    id:         p.id as string,
    first_name: p.first_name as string,
    last_name:  p.last_name  as string,
  }))

  const sessions = (sessionsRaw ?? []) as SkillsSession[]
  const attempts = (attemptsRaw ?? []) as SkillsAttempt[]

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Skills Competition</h1>
      {players.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No players linked to your account.</p>
      ) : (
        <ParentSkillsView players={players} sessions={sessions} attempts={attempts} />
      )}
    </div>
  )
}
