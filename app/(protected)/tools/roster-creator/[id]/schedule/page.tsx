import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "../../db";
import { normalizeSchedule } from "../../schedule";
import ScheduleBoard, { type SchedTeam } from "./ScheduleBoard";

export default async function SchedulePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name, schedule_config")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const [{ data: divisions }, { data: teams }, players, { data: coaches }] = await Promise.all([
    supabase.from("tb_divisions").select("id, name, position").eq("season_id", id).order("position"),
    supabase
      .from("tb_teams")
      .select("id, division_id, name, practice_night, practice_time, field, position")
      .eq("season_id", id)
      .order("position"),
    selectAll((from, to) =>
      supabase
        .from("tb_players")
        .select("team_id, resolved_coach_id")
        .eq("season_id", id)
        .order("id")
        .range(from, to)
    ),
    supabase.from("tb_coaches").select("id, name").eq("season_id", id),
  ]);

  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));

  // Dominant coach per team (most-requested among its members).
  const votes = new Map<string, Map<string, number>>();
  for (const p of players) {
    const tid = p.team_id as string | null;
    const cid = p.resolved_coach_id as string | null;
    if (!tid || !cid) continue;
    if (!votes.has(tid)) votes.set(tid, new Map());
    const m = votes.get(tid)!;
    m.set(cid, (m.get(cid) ?? 0) + 1);
  }
  const domCoach = (tid: string): string => {
    const m = votes.get(tid);
    if (!m) return "";
    let best = "";
    let n = -1;
    for (const [c, v] of m) if (v > n) { n = v; best = c; }
    return coachName.get(best) ?? "";
  };

  const schedTeams: SchedTeam[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    divisionId: t.division_id as string,
    coach: domCoach(t.id as string),
    day: (t.practice_night as string | null) ?? null,
    time: (t.practice_time as string | null) ?? null,
    field: (t.field as string | null) ?? null,
  }));

  return (
    <ScheduleBoard
      seasonId={id}
      seasonName={season.name as string}
      divisions={(divisions ?? []).map((d) => ({ id: d.id as string, name: d.name as string }))}
      teams={schedTeams}
      config={normalizeSchedule(season.schedule_config as Parameters<typeof normalizeSchedule>[0])}
    />
  );
}
