import type { SupabaseClient } from "@supabase/supabase-js";
import type { RosterRow } from "./export-csv";
import { selectAll } from "./db";
import { parseNights } from "./group/engine";
import { fmtTime } from "./schedule";
import { accountNameOf, isCoachChild } from "./fields";

// Flat roster rows for a season, ordered division → team → last name. Shared by
// the CSV download, the print view, and the email action. Plain server helper
// (not a server action) so it can take a SupabaseClient and be imported by both
// actions and server components.
//
// Beyond the bare roster, each row carries a request-vs-result audit: what the
// family asked for (coach / team / buddies / night) and whether the generated
// team honored it. A team stores no coach of its own, so each team's "coach"
// and "team name" are the dominant resolved request among its members — the
// same notion used to flag unmet requests on the board.
export async function fetchRosterRows(
  supabase: SupabaseClient,
  seasonId: string
): Promise<RosterRow[]> {
  const [{ data: divisions }, { data: teams }, players, links, { data: coaches }, { data: teamNames }] =
    await Promise.all([
      supabase.from("tb_divisions").select("id, name, position").eq("season_id", seasonId).order("position"),
      supabase.from("tb_teams").select("id, name, division_id, practice_night, practice_time, field, position, coach_id, is_placeholder").eq("season_id", seasonId).order("position"),
      selectAll((from, to) =>
        supabase
          .from("tb_players")
          .select(
            "id, first_name, last_name, age_group, school, division_id, team_id, resolved_coach_id, resolved_team_name_id, practice_nights, raw"
          )
          .eq("season_id", seasonId)
          .order("id")
          .range(from, to)
      ),
      selectAll((from, to) =>
        supabase
          .from("tb_buddy_links")
          .select("from_player_id, to_player_id")
          .eq("season_id", seasonId)
          .order("from_player_id")
          .range(from, to)
      ),
      supabase.from("tb_coaches").select("id, name").eq("season_id", seasonId),
      supabase.from("tb_team_names").select("id, name").eq("season_id", seasonId),
    ]);

  const divName = new Map((divisions ?? []).map((d) => [d.id as string, d.name as string]));
  const divPos = new Map((divisions ?? []).map((d, i) => [d.id as string, i]));
  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const teamNameOf = new Map((teamNames ?? []).map((t) => [t.id as string, t.name as string]));
  const teamMeta = new Map(
    (teams ?? []).map((t) => [
      t.id as string,
      {
        name: t.name as string,
        night: (t.practice_night as string | null) ?? "",
        time: (t.practice_time as string | null) ?? "",
        field: (t.field as string | null) ?? "",
        coachId: (t.coach_id as string | null) ?? "",
        isPlaceholder: !!t.is_placeholder,
      },
    ])
  );

  // Directed buddy requests: only the kids a player named themselves.
  const buddyReqOf = new Map<string, string[]>();
  for (const l of links) {
    const from = l.from_player_id as string;
    if (!buddyReqOf.has(from)) buddyReqOf.set(from, []);
    buddyReqOf.get(from)!.push(l.to_player_id as string);
  }

  const teamOfPlayer = new Map((players ?? []).map((p) => [p.id as string, (p.team_id as string | null) ?? null]));

  // A team's coach is authoritative (tb_teams.coach_id) — placeholder teams have
  // none. The team-name request is still the dominant one among members (that
  // notion is unchanged; in practice it's empty under the coach-anchored model).
  const teamNameVotes = new Map<string, Map<string, number>>();
  const vote = (m: Map<string, Map<string, number>>, team: string, key: string) => {
    if (!m.has(team)) m.set(team, new Map());
    const inner = m.get(team)!;
    inner.set(key, (inner.get(key) ?? 0) + 1);
  };
  for (const p of players ?? []) {
    const tid = p.team_id as string | null;
    if (!tid) continue;
    if (p.resolved_team_name_id) vote(teamNameVotes, tid, p.resolved_team_name_id as string);
  }
  const argmax = (m: Map<string, number> | undefined): string => {
    if (!m) return "";
    let best = "";
    let n = -1;
    for (const [k, v] of m) if (v > n) { n = v; best = k; }
    return best;
  };
  const teamTeamId = new Map([...teamNameVotes.keys()].map((tid) => [tid, argmax(teamNameVotes.get(tid))]));

  const yn = (cond: boolean) => (cond ? "Yes" : "No");

  const rows: RosterRow[] = (players ?? []).map((p) => {
    const pid = p.id as string;
    const tid = p.team_id as string | null;
    const meta = tid ? teamMeta.get(tid) : null;

    const reqCoachId = (p.resolved_coach_id as string | null) ?? null;
    const reqTeamId = (p.resolved_team_name_id as string | null) ?? null;
    const tCoachId = tid ? teamMeta.get(tid)?.coachId ?? "" : "";
    const tTeamId = tid ? teamTeamId.get(tid) ?? "" : "";

    // Buddies: how many named, how many of them share the assigned team.
    const reqBuddies = buddyReqOf.get(pid) ?? [];
    const buddiesWith = tid ? reqBuddies.filter((b) => teamOfPlayer.get(b) === tid).length : 0;

    const nights = parseNights((p.practice_nights as string) ?? "");
    const teamNight = meta?.night ?? "";

    // Coach's own child (same test generateTeams uses to protect the team).
    const reqCoachName = reqCoachId ? coachName.get(reqCoachId) ?? "" : "";
    const coachKid = isCoachChild((p.last_name as string) ?? "", accountNameOf(p.raw), reqCoachName);

    return {
      division: divName.get(p.division_id as string) ?? "",
      team: meta?.name ?? "Unassigned",
      night: teamNight,
      time: meta?.time ? fmtTime(meta.time) : "",
      field: meta?.field ?? "",
      first: (p.first_name as string) ?? "",
      last: (p.last_name as string) ?? "",
      age: (p.age_group as string) ?? "",
      school: (p.school as string) ?? "",

      coachReq: reqCoachId ? coachName.get(reqCoachId) ?? "" : "",
      coachAssigned: tCoachId ? coachName.get(tCoachId) ?? "" : "",
      coachMet: !tid || !reqCoachId ? "" : yn(reqCoachId === tCoachId),
      teamReq: reqTeamId ? teamNameOf.get(reqTeamId) ?? "" : "",
      teamMet: !tid || !reqTeamId ? "" : yn(reqTeamId === tTeamId),
      buddiesReq: reqBuddies.length ? String(reqBuddies.length) : "",
      buddiesWith: reqBuddies.length && tid ? String(buddiesWith) : "",
      buddiesMet: !tid || reqBuddies.length === 0 ? "" : yn(buddiesWith > 0),
      nightsFree: nights.join(", "),
      nightMet: !teamNight || nights.length === 0 ? "" : yn(nights.includes(teamNight)),
      role: !tid ? "" : reqCoachId === tCoachId && reqCoachId ? "Requester" : reqTeamId === tTeamId && reqTeamId ? "Requester" : "Filled",
      coachChild: coachKid ? "Yes" : "",
    };
  });

  // Within a division: coached teams first (alphabetical), then the uncoached
  // "Team N" placeholders (numeric-aware), then the Unassigned bucket last.
  const teamRank = new Map<string, number>();
  for (const t of teams ?? []) {
    const uncoached = !!t.is_placeholder || !t.coach_id;
    teamRank.set(t.name as string, uncoached ? 1 : 0);
  }
  const rankOf = (team: string) => (team === "Unassigned" ? 2 : teamRank.get(team) ?? 1);

  return rows.sort(
    (a, b) =>
      (divPos.get(a.division) ?? 0) - (divPos.get(b.division) ?? 0) ||
      a.division.localeCompare(b.division) ||
      rankOf(a.team) - rankOf(b.team) ||
      a.team.localeCompare(b.team, undefined, { numeric: true }) ||
      a.last.localeCompare(b.last)
  );
}
