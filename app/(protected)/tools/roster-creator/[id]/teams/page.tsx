import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNights, normalizeConfig } from "../../group/engine";
import { selectAll } from "../../db";
import { isNoRequest, looksLikeCoachName } from "../../fields";
import { crossDivisionFlag } from "../../resolve/hints";
import TeamsBoard, { type BoardPlayer, type BoardTeam, type PlayUpFlag } from "./TeamsBoard";

export default async function TeamsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("id, name, grouping_config")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const [{ data: divisions }, { data: teams }, players, links, { data: coaches }, { data: teamNamesRows }, { data: assists }] =
    await Promise.all([
      supabase.from("tb_divisions").select("id, name, position, locked").eq("season_id", id).order("position"),
      supabase
        .from("tb_teams")
        .select("id, division_id, name, practice_night, position, coach_id, locked")
        .eq("season_id", id)
        .order("position"),
      selectAll((from, to) =>
        supabase
          .from("tb_players")
          .select(
            "id, first_name, last_name, division_id, team_id, resolved_coach_id, resolved_team_name_id, practice_nights, package_name, coach_first, coach_last, team_name, buddy_first, buddy_last, raw"
          )
          .eq("season_id", id)
          .order("id")
          .range(from, to)
      ),
      selectAll((from, to) =>
        supabase
          .from("tb_buddy_links")
          .select("from_player_id, to_player_id")
          .eq("season_id", id)
          .order("from_player_id")
          .range(from, to)
      ),
      supabase.from("tb_coaches").select("id, name").eq("season_id", id),
      supabase.from("tb_team_names").select("id, name").eq("season_id", id),
      supabase.from("tb_team_coaches").select("team_id, coach_id").eq("season_id", id),
    ]);

  const coachNames: Record<string, string> = Object.fromEntries((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const teamNames: Record<string, string> = Object.fromEntries((teamNamesRows ?? []).map((t) => [t.id as string, t.name as string]));

  // Assistant coach names per team (head stays tb_teams.coach_id).
  const assistantsByTeam = new Map<string, string[]>();
  for (const a of assists ?? []) {
    const tid = a.team_id as string;
    const name = coachNames[a.coach_id as string] ?? "";
    if (!name) continue;
    if (!assistantsByTeam.has(tid)) assistantsByTeam.set(tid, []);
    assistantsByTeam.get(tid)!.push(name);
  }

  // Directed: a player's buddyIds are only the kids THEY requested (outgoing).
  // A kid named by someone else, who requested nobody, shouldn't be flagged for
  // "no buddy on this team".
  const buddies = new Map<string, Set<string>>();
  for (const l of links ?? []) {
    const from = l.from_player_id as string;
    if (!buddies.has(from)) buddies.set(from, new Set());
    buddies.get(from)!.add(l.to_player_id as string);
  }

  const boardPlayers: BoardPlayer[] = (players ?? []).map((p) => ({
    id: p.id as string,
    name: `${p.first_name} ${p.last_name}`.trim(),
    divisionId: (p.division_id as string | null) ?? "",
    teamId: (p.team_id as string | null) ?? null,
    coachId: (p.resolved_coach_id as string | null) ?? null,
    // They asked for a coach only when the coach field actually looks like a
    // coach NAME — not a note that landed there ("same practice night as his
    // brother"). Counts unmatched requests, but not data-in-the-wrong-field.
    coachReq: looksLikeCoachName([p.coach_first, p.coach_last].filter((v) => v && !isNoRequest(v as string)).join(" ")),
    coachReqText: looksLikeCoachName([p.coach_first, p.coach_last].filter((v) => v && !isNoRequest(v as string)).join(" "))
      ? [p.coach_first, p.coach_last].filter((v) => v && !isNoRequest(v as string)).join(" ").trim()
      : "",
    teamNameId: (p.resolved_team_name_id as string | null) ?? null,
    nights: parseNights((p.practice_nights as string) ?? ""),
    buddyIds: [...(buddies.get(p.id as string) ?? [])],
    // Did they name a buddy at all (matched or not)? Counts the raw request so
    // the stat's denominator isn't limited to buddies we could resolve.
    buddyReq: !isNoRequest((p.buddy_first as string) ?? "") || !isNoRequest((p.buddy_last as string) ?? ""),
    raw: (p.raw as Record<string, unknown> | null) ?? null,
  }));

  const boardTeams: BoardTeam[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    divisionId: t.division_id as string,
    name: t.name as string,
    night: (t.practice_night as string | null) ?? null,
    coachId: (t.coach_id as string | null) ?? null,
    assistants: assistantsByTeam.get(t.id as string) ?? [],
    locked: !!t.locked,
  }));

  const config = normalizeConfig(season.grouping_config as Parameters<typeof normalizeConfig>[0]);

  // Players whose request points at a different age bracket than they enrolled
  // in (deterministic — self-clears once moved to the matching division).
  const divName = new Map((divisions ?? []).map((d) => [d.id as string, d.name as string]));
  const playUps: PlayUpFlag[] = [];
  (players ?? []).forEach((p, i) => {
    // Compare the request against the player's CURRENT division, not their
    // original package — so the flag clears the moment they're moved up/down.
    const curDiv = divName.get((p.division_id as string) ?? "") ?? (p.package_name as string) ?? "";
    const flag = crossDivisionFlag(
      i,
      curDiv,
      (p.team_name as string) ?? "",
      `${p.coach_first ?? ""} ${p.coach_last ?? ""}`,
      `${p.buddy_first ?? ""} ${p.buddy_last ?? ""}`
    );
    if (!flag) return;
    const gender = /girls?/i.test(curDiv) ? "girls?" : /boys?/i.test(curDiv) ? "boys?" : /coed/i.test(curDiv) ? "coed" : "";
    const target = (divisions ?? []).find(
      (d) =>
        new RegExp(`\\b${flag.hintedAge}U\\b`, "i").test(d.name as string) &&
        (gender ? new RegExp(gender, "i").test(d.name as string) : true)
    );
    // The exact request text that triggered it — the non-empty request fields.
    const source = [
      (p.team_name as string) ?? "",
      `${p.coach_first ?? ""} ${p.coach_last ?? ""}`.trim(),
      `${p.buddy_first ?? ""} ${p.buddy_last ?? ""}`.trim(),
    ]
      .map((s) => s.trim())
      .filter((s) => s && !isNoRequest(s))
      .join(" · ");
    playUps.push({
      playerId: p.id as string,
      name: `${p.first_name} ${p.last_name}`.trim(),
      currentDivision: divName.get((p.division_id as string) ?? "") ?? "",
      enrolledAge: flag.enrolledAge,
      hintedAge: flag.hintedAge,
      suggestedDivisionId: (target?.id as string) ?? null,
      source,
    });
  });

  return (
    <TeamsBoard
      seasonId={id}
      seasonName={season.name as string}
      config={config}
      divisions={(divisions ?? []).map((d) => ({ id: d.id as string, name: d.name as string, locked: !!d.locked }))}
      teams={boardTeams}
      players={boardPlayers}
      playUps={playUps}
      coachNames={coachNames}
      teamNames={teamNames}
    />
  );
}
