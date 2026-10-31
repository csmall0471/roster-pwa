import "server-only";

import type { createClient } from "@/lib/supabase/server";
import type { AssignTarget, Teammate } from "@/app/_components/cardgen/CardEditor";
import { ageFromDob, toAssignTargets } from "@/app/_components/cardgen/assign-targets";
import { sportFromTeam } from "@/app/_components/cardgen/sports";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// The players this user can attach a card to, one target per active team, plus
// each team's teammates for group cards. Scoped helpers own no players, so they
// get nothing here.
export async function loadAssignTargets(
  supabase: Supabase,
  userId: string
): Promise<{
  assignTargets: AssignTarget[];
  teammatesByTeam: Record<string, Teammate[]>;
  // Set when a query failed, so callers can tell that from "no players".
  error: string | null;
}> {
  const { data: players, error: playersError } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("user_id", userId);
  let error = playersError?.message ?? null;

  let assignTargets: AssignTarget[] = [];
  // Teammates per team (for group cards), built from the roster rows already
  // loaded below — no extra query. Only the owner's own players are available
  // here, so each team lists the owner's players who are active on it.
  const teammatesByTeam: Record<string, Teammate[]> = {};
  const ids = (players ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    const { data: rosterRows, error: rosterError } = await supabase
      .from("roster")
      .select(
        "player_id, status, jersey_number, teams(id, name, season, age_group, season_start, season_end, sport, assistant_coach_parent_ids)"
      )
      .in("player_id", ids)
      .order("created_at", { ascending: false });
    error ??= rosterError?.message ?? null;

    // Build the teammates-per-team map from the roster rows just loaded.
    const teammateNameById = new Map(
      (players ?? []).map((p) => [
        p.id as string,
        { firstName: p.first_name as string, lastName: p.last_name as string },
      ])
    );
    const teammateRows = (rosterRows ?? []) as unknown as Array<{
      player_id: string | null;
      status: string | null;
      teams: { id: string } | null;
    }>;
    for (const r of teammateRows) {
      const tId = r.teams?.id;
      if (!tId || r.status !== "active" || !r.player_id) continue;
      const name = teammateNameById.get(r.player_id);
      if (!name) continue;
      const list = (teammatesByTeam[tId] ??= []);
      if (list.some((m) => m.id === r.player_id)) continue;
      list.push({ id: r.player_id, firstName: name.firstName, lastName: name.lastName });
    }

    // Resolve each team's assistant-coach parent ids to names, so picking a
    // player pre-fills the card's coaching from their team.
    const rows = (rosterRows ?? []) as unknown as Array<{
      teams: { id: string; assistant_coach_parent_ids: string[] | null } | null;
    }>;
    const coachIds = [
      ...new Set(rows.flatMap((r) => r.teams?.assistant_coach_parent_ids ?? [])),
    ];
    const nameByParent = new Map<string, string>();
    if (coachIds.length) {
      const { data: coachRows } = await supabase
        .from("parents")
        .select("id, first_name, last_name")
        .in("id", coachIds);
      for (const c of coachRows ?? []) {
        nameByParent.set(c.id as string, `${c.first_name} ${c.last_name}`.trim());
      }
    }
    const assistantByTeam = new Map<string, string>();
    for (const r of rows) {
      const t = r.teams;
      if (!t) continue;
      const names = (t.assistant_coach_parent_ids ?? [])
        .map((cid) => nameByParent.get(cid))
        .filter(Boolean) as string[];
      if (names.length) assistantByTeam.set(t.id, names.join(", "));
    }

    assignTargets = toAssignTargets(
      players ?? [],
      (rosterRows ?? []) as unknown as Parameters<typeof toAssignTargets>[1]
    ).map((t) => ({
      ...t,
      assistantCoaches: t.teamId ? assistantByTeam.get(t.teamId) ?? null : null,
    }));
  }

  return { assignTargets, teammatesByTeam, error };
}

// A draft can outlive its earmark as an active target: the season ends, or the
// kid goes inactive. This rebuilds the target so the draft's player still shows
// in the picker, can be published, and keeps its earmark when updated.
export async function loadDraftEarmarkTarget(
  supabase: Supabase,
  userId: string,
  playerId: string,
  teamId: string | null
): Promise<AssignTarget | null> {
  // Failures throw: treating them as "no player" would let a later save wipe
  // the draft's earmark.
  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("id", playerId)
    .eq("user_id", userId)
    .maybeSingle();
  if (playerError) throw new Error(playerError.message);
  if (!player) return null;

  const firstName = (player.first_name as string) ?? "";
  const lastName = (player.last_name as string) ?? "";
  const base = {
    key: `${playerId}::${teamId ?? "none"}`,
    id: playerId,
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    playerAge: ageFromDob(player.date_of_birth as string | null),
  };
  const noTeam = { teamId: null, teamName: null, season: null, ageGroup: null, jersey: null };
  if (!teamId) return { ...base, ...noTeam };

  const [{ data: team, error: teamError }, { data: rosterRow, error: rosterError }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, season, age_group, sport, assistant_coach_parent_ids")
      .eq("id", teamId)
      .maybeSingle(),
    supabase
      .from("roster")
      .select("jersey_number")
      .eq("player_id", playerId)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (teamError ?? rosterError) throw new Error((teamError ?? rosterError)!.message);
  if (!team) return { ...base, ...noTeam };

  const coachIds = (team.assistant_coach_parent_ids as string[] | null) ?? [];
  const { data: coaches } = coachIds.length
    ? await supabase.from("parents").select("first_name, last_name").in("id", coachIds)
    : { data: [] };
  return {
    ...base,
    teamId,
    teamName: team.name as string,
    season: (team.season as string | null) ?? null,
    ageGroup: (team.age_group as string | null) ?? null,
    jersey: rosterRow?.jersey_number != null ? String(rosterRow.jersey_number) : null,
    assistantCoaches:
      (coaches ?? []).map((c) => `${c.first_name} ${c.last_name}`.trim()).join(", ") || null,
    sport: sportFromTeam(team.sport as string | null),
  };
}
