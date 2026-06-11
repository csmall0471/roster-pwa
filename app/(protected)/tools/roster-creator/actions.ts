"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  type CanonicalRecord,
  type ColumnMapping,
  type RowData,
  FIELD_DEFS,
  accountNameOf,
  canonicalRecord,
  isCoachChild,
  isNoRequest,
  packageOf,
} from "./fields";
import { buildProposal, type EntityProposal, type PlayerInput } from "./resolve/engine";
import { canonicalizeEntities, matchBuddiesWithClaude } from "./resolve/claude";
import { runAnalysis } from "./analyze";
import { selectAll } from "./db";
import type { ScheduleConfig } from "./schedule";
import {
  type GroupConfig,
  type GroupPlayer,
  assignDivision,
  normalizeConfig,
  parseNights,
} from "./group/engine";
import { rosterToCsv } from "./export-csv";
import { fetchRosterRows } from "./roster-data";
import { normalize, jaroWinkler } from "./resolve/similarity";

// Map a player file's free-text division string (package_name, e.g. "Peoria 8U
// Boys") onto the closest authoritative division created from the coach workbook
// (e.g. "8u Boys"). Primary signal is ASYMMETRIC coverage: what fraction of the
// DIVISION's name tokens appear in the package. Division labels are short ("6u",
// "8u boys") and packages add prefixes ("Peoria …"), so coverage stays 1.0 for a
// real match even when the package is much longer — unlike symmetric Jaccard,
// which sank "Peoria 6U Coed" → "6u" to 0.23 and spawned a rogue division.
// Jaro-Winkler is a light tiebreak. Returns the best division + score.
function bestDivisionMatch(
  pkg: string,
  divisions: { id: string; name: string }[]
): { id: string; score: number } | null {
  const pkgTokens = new Set(normalize(pkg).split(" ").filter(Boolean));
  let best: { id: string; score: number } | null = null;
  for (const d of divisions) {
    const dTokens = [...new Set(normalize(d.name).split(" ").filter(Boolean))];
    if (dTokens.length === 0) continue;
    const covered = dTokens.filter((t) => pkgTokens.has(t)).length / dTokens.length;
    const jw = jaroWinkler(normalize(pkg), normalize(d.name));
    const score = covered * 0.8 + jw * 0.2;
    if (!best || score > best.score) best = { id: d.id, score };
  }
  return best;
}

// Ensure the caller is the coach/owner (authenticated, not a parent). RLS also
// enforces this, but we fail fast and clearly here too.
async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (parentLink) throw new Error("Not authorized");

  return { supabase, user };
}

export type CommitImportInput = {
  // Target either an existing season or a new one.
  existingSeasonId?: string;
  seasonName?: string;
  sport?: string;
  sourceFilename: string;
  headers: string[];
  columnMapping: ColumnMapping;
  rows: RowData[];
  groupingConfig?: GroupConfig;
};

// Parse-and-review is done client-side; this commits the result into a season:
// creates/uses the season, records the import, ensures a division exists per
// distinct package_name, and inserts players with materialized fields.
export async function commitImport(input: CommitImportInput): Promise<string> {
  const { supabase } = await requireOwner();

  // 1. Season (new or existing).
  let seasonId = input.existingSeasonId ?? null;
  if (!seasonId) {
    const { data: season, error } = await supabase
      .from("tb_seasons")
      .insert({
        name: input.seasonName?.trim() || "Untitled season",
        sport: input.sport?.trim() || null,
        grouping_config: input.groupingConfig ?? {},
      })
      .select("id")
      .single();
    if (error || !season) throw new Error(error?.message ?? "Failed to create season");
    seasonId = season.id as string;
  } else if (input.groupingConfig) {
    await supabase.from("tb_seasons").update({ grouping_config: input.groupingConfig }).eq("id", seasonId);
  }

  // 2. Import record (provenance + mapping).
  const { data: imp, error: impErr } = await supabase
    .from("tb_imports")
    .insert({
      season_id: seasonId,
      source_filename: input.sourceFilename,
      headers: input.headers,
      column_mapping: input.columnMapping,
      row_count: input.rows.length,
    })
    .select("id")
    .single();
  if (impErr || !imp) throw new Error(impErr?.message ?? "Failed to record import");

  // 3. Resolve each player's division. When the season was set up from a coach
  //    workbook, the authoritative divisions already exist — map each file
  //    package_name onto the closest one (so "Boys 8U" lands in "8u Boys").
  //    Only create a division as a fallback when a package matches nothing, so
  //    no player is silently dropped. Legacy/player-first seasons (no divisions
  //    yet) keep the original behaviour: one division per distinct package.
  const records = input.rows.map((row) => canonicalRecord(row, input.columnMapping));
  const packages = [...new Set(records.map(packageOf))].filter(Boolean);

  const { data: existing } = await supabase
    .from("tb_divisions")
    .select("id, name")
    .eq("season_id", seasonId);
  const existingDivs = (existing ?? []).map((d) => ({ id: d.id as string, name: d.name as string }));
  const divisionIdByPackage = new Map<string, string>();

  if (existingDivs.length > 0) {
    const unmatched: string[] = [];
    for (const pkg of packages) {
      const m = bestDivisionMatch(pkg, existingDivs);
      // A real match has full division-token coverage (≥0.8). 0.5 cleanly
      // separates those from a package with no corresponding division.
      if (m && m.score >= 0.5) divisionIdByPackage.set(pkg, m.id);
      else unmatched.push(pkg);
    }
    if (unmatched.length > 0) {
      const basePos = existingDivs.length;
      const { data: created, error: divErr } = await supabase
        .from("tb_divisions")
        .insert(unmatched.map((name, i) => ({ season_id: seasonId, name, position: basePos + i })))
        .select("id, name");
      if (divErr) throw new Error(divErr.message);
      for (const d of created ?? []) divisionIdByPackage.set(d.name as string, d.id as string);
    }
  } else if (packages.length > 0) {
    const { data: created, error: divErr } = await supabase
      .from("tb_divisions")
      .insert(packages.map((name, i) => ({ season_id: seasonId, name, position: i })))
      .select("id, name");
    if (divErr) throw new Error(divErr.message);
    for (const d of created ?? []) divisionIdByPackage.set(d.name as string, d.id as string);
  }

  // 4. Insert players with materialized canonical fields + their division.
  const players = input.rows.map((row, i) => {
    const rec = records[i];
    return {
      season_id: seasonId,
      import_id: imp.id,
      division_id: divisionIdByPackage.get(packageOf(rec)) ?? null,
      first_name: rec.first_name,
      last_name: rec.last_name,
      gender: rec.gender,
      age_group: rec.age_group,
      package_name: rec.package_name,
      school: rec.school,
      coach_first: rec.coach_first,
      coach_last: rec.coach_last,
      team_name: rec.team_name,
      buddy_first: rec.buddy_first,
      buddy_last: rec.buddy_last,
      practice_nights: rec.practice_nights,
      raw: row,
    };
  });

  if (players.length > 0) {
    const { error: plErr } = await supabase.from("tb_players").insert(players);
    if (plErr) throw new Error(plErr.message);
  }

  revalidatePath("/tools/roster-creator");
  revalidatePath(`/tools/roster-creator/${seasonId}`);
  return seasonId;
}

// ── Set up a season from the coach/teams workbook (the new first step) ────────
// One sheet per division, one row per team (a coach name, or "Team N" for an
// open slot). This is the authoritative source of divisions, coaches, and the
// team COUNT per division — created BEFORE players are imported. Generation
// later only assigns players into these teams; it never invents teams.
export type CreateSeasonFromRosterInput = {
  seasonName: string;
  sport?: string;
  defaultTeamSize: number;
  divisions: {
    name: string;
    targetTeamSize: number;
    teams: { coachName: string | null; isPlaceholder: boolean; rawLabel: string }[];
  }[];
};

export async function createSeasonFromRoster(input: CreateSeasonFromRosterInput): Promise<string> {
  const { supabase } = await requireOwner();
  const defaultSize = Math.max(1, Math.round(input.defaultTeamSize || 10));

  // 1. Season — default players-per-team lives in grouping_config.target.
  const { data: season, error } = await supabase
    .from("tb_seasons")
    .insert({
      name: input.seasonName.trim() || "Untitled season",
      sport: input.sport?.trim() || null,
      grouping_config: { target: defaultSize },
      status: "structured",
    })
    .select("id")
    .single();
  if (error || !season) throw new Error(error?.message ?? "Failed to create season");
  const seasonId = season.id as string;

  // 2. Distinct coaches across the whole season → one tb_coaches identity each,
  //    even when a coach leads teams in multiple divisions.
  const coachNames = [
    ...new Set(
      input.divisions
        .flatMap((d) => d.teams)
        .filter((t) => !t.isPlaceholder && t.coachName)
        .map((t) => t.coachName!.trim())
        .filter(Boolean)
    ),
  ];
  const coachIdByName = new Map<string, string>();
  if (coachNames.length > 0) {
    const { data, error: cErr } = await supabase
      .from("tb_coaches")
      .insert(coachNames.map((name) => ({ season_id: seasonId, name })))
      .select("id, name");
    if (cErr) throw new Error(cErr.message);
    (data ?? []).forEach((r) => coachIdByName.set(r.name as string, r.id as string));
  }

  // 3. Each division (with its own target size) and its teams (coached or open).
  for (let i = 0; i < input.divisions.length; i++) {
    const d = input.divisions[i];
    const { data: div, error: dErr } = await supabase
      .from("tb_divisions")
      .insert({
        season_id: seasonId,
        name: d.name.trim() || `Division ${i + 1}`,
        position: i,
        target_team_size: Math.max(1, Math.round(d.targetTeamSize || defaultSize)),
      })
      .select("id")
      .single();
    if (dErr || !div) throw new Error(dErr?.message ?? "Failed to create division");
    const divisionId = div.id as string;

    const teamRows = d.teams.map((t, pos) => {
      const coachName = (t.coachName ?? "").trim();
      return {
        season_id: seasonId,
        division_id: divisionId,
        name: t.isPlaceholder
          ? t.rawLabel.trim() || `Team ${pos + 1}`
          : coachName || `Team ${pos + 1}`,
        coach_id: t.isPlaceholder ? null : coachIdByName.get(coachName) ?? null,
        is_placeholder: t.isPlaceholder,
        position: pos,
      };
    });
    if (teamRows.length > 0) {
      const { error: tErr } = await supabase.from("tb_teams").insert(teamRows);
      if (tErr) throw new Error(tErr.message);
    }
  }

  revalidatePath("/tools/roster-creator");
  revalidatePath(`/tools/roster-creator/${seasonId}`);
  return seasonId;
}

export async function addDivision(seasonId: string, name: string) {
  const { supabase } = await requireOwner();
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Division name is required");
  const { error } = await supabase
    .from("tb_divisions")
    .insert({ season_id: seasonId, name: trimmed });
  if (error) {
    if (error.code === "23505") throw new Error("A division with that name already exists");
    throw new Error(error.message);
  }
  revalidatePath(`/tools/roster-creator/${seasonId}`);
}

// Merge one division into another: move the source division's players into the
// target (clearing their team_id, since the target's teams differ), delete the
// source division's teams, then delete the source division. Fixes a stray
// division created when a player file's package_name didn't match the roster
// (e.g. "Peoria 6U Coed" landing beside the authoritative "6u").
export async function mergeDivision(seasonId: string, fromDivisionId: string, intoDivisionId: string) {
  const { supabase } = await requireOwner();
  if (!fromDivisionId || !intoDivisionId || fromDivisionId === intoDivisionId) {
    throw new Error("Pick a different target division to merge into.");
  }

  const { error: pErr } = await supabase
    .from("tb_players")
    .update({ division_id: intoDivisionId, team_id: null })
    .eq("season_id", seasonId)
    .eq("division_id", fromDivisionId);
  if (pErr) throw new Error(pErr.message);

  await supabase.from("tb_teams").delete().eq("season_id", seasonId).eq("division_id", fromDivisionId);
  const { error: dErr } = await supabase
    .from("tb_divisions")
    .delete()
    .eq("season_id", seasonId)
    .eq("id", fromDivisionId);
  if (dErr) throw new Error(dErr.message);

  revalidatePath(`/tools/roster-creator/${seasonId}`);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

export async function updateScheduleConfig(seasonId: string, config: ScheduleConfig) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("tb_seasons").update({ schedule_config: config }).eq("id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/schedule`);
}

// Set a team's practice day / time / field. Any of them may be null to clear.
export async function setTeamSchedule(
  seasonId: string,
  teamId: string,
  day: string | null,
  time: string | null,
  field: string | null
) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_teams")
    .update({ practice_night: day, practice_time: time, field })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/schedule`);
}

export async function movePlayer(
  seasonId: string,
  playerId: string,
  divisionId: string | null
) {
  const { supabase } = await requireOwner();
  // Moving divisions makes the old team meaningless — drop it so the player
  // lands in the target division's Unassigned column rather than staying on a
  // team from a different division.
  const { error } = await supabase
    .from("tb_players")
    .update({ division_id: divisionId, team_id: null })
    .eq("id", playerId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}`);
}

export async function renameSeason(seasonId: string, name: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_seasons")
    .update({ name: name.trim() || "Untitled season", updated_at: new Date().toISOString() })
    .eq("id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath("/tools/roster-creator");
  revalidatePath(`/tools/roster-creator/${seasonId}`);
}

export async function deleteSeason(seasonId: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("tb_seasons").delete().eq("id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath("/tools/roster-creator");
}

// ── Resolution ───────────────────────────────────────────────────────────────

export type ApplyResolutionInput = {
  coaches: { canonical: string; playerIds: string[] }[];
  teams: { canonical: string; playerIds: string[] }[];
  buddyLinks: { fromId: string; toId: string }[];
};

// Persist a confirmed resolution. Idempotent: clears the season's prior
// canonical entities + buddy links (which nulls player refs via ON DELETE SET
// NULL), then writes the accepted set fresh.
export async function applyResolution(seasonId: string, input: ApplyResolutionInput) {
  const { supabase } = await requireOwner();

  await supabase.from("tb_buddy_links").delete().eq("season_id", seasonId);
  await supabase.from("tb_coaches").delete().eq("season_id", seasonId);
  await supabase.from("tb_team_names").delete().eq("season_id", seasonId);

  // Coaches
  const coachNames = [...new Set(input.coaches.map((c) => c.canonical).filter(Boolean))];
  if (coachNames.length > 0) {
    const { data: rows, error } = await supabase
      .from("tb_coaches")
      .insert(coachNames.map((name) => ({ season_id: seasonId, name })))
      .select("id, name");
    if (error) throw new Error(error.message);
    const idByName = new Map((rows ?? []).map((r) => [r.name as string, r.id as string]));
    for (const c of input.coaches) {
      const id = idByName.get(c.canonical);
      if (id && c.playerIds.length) {
        const { error: upErr } = await supabase
          .from("tb_players")
          .update({ resolved_coach_id: id })
          .in("id", c.playerIds);
        if (upErr) throw new Error(upErr.message);
      }
    }
  }

  // Team names
  const teamNames = [...new Set(input.teams.map((t) => t.canonical).filter(Boolean))];
  if (teamNames.length > 0) {
    const { data: rows, error } = await supabase
      .from("tb_team_names")
      .insert(teamNames.map((name) => ({ season_id: seasonId, name })))
      .select("id, name");
    if (error) throw new Error(error.message);
    const idByName = new Map((rows ?? []).map((r) => [r.name as string, r.id as string]));
    for (const t of input.teams) {
      const id = idByName.get(t.canonical);
      if (id && t.playerIds.length) {
        const { error: upErr } = await supabase
          .from("tb_players")
          .update({ resolved_team_name_id: id })
          .in("id", t.playerIds);
        if (upErr) throw new Error(upErr.message);
      }
    }
  }

  // Buddy links (dedupe identical directed pairs)
  const seen = new Set<string>();
  const links = input.buddyLinks.filter((l) => {
    const key = `${l.fromId}->${l.toId}`;
    if (l.fromId === l.toId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (links.length > 0) {
    const { error } = await supabase.from("tb_buddy_links").insert(
      links.map((l) => ({ season_id: seasonId, from_player_id: l.fromId, to_player_id: l.toId }))
    );
    if (error) throw new Error(error.message);
  }

  revalidatePath(`/tools/roster-creator/${seasonId}`);
  revalidatePath(`/tools/roster-creator/${seasonId}/resolve`);
}

export type SuggestedBuddyLink = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  rawName: string;
};

export type ClaudePassResult = {
  coaches: EntityProposal[];
  teams: EntityProposal[];
  buddyLinks: SuggestedBuddyLink[];
  error?: string;
};

function coachValue(p: Record<string, unknown>): string {
  return [p.coach_first, p.coach_last]
    .filter((v) => v && !isNoRequest(v as string))
    .join(" ")
    .trim();
}

// Group canonicalized entity groups back to player ids by their raw value.
function groupsToProposals(
  groups: { canonical: string; variants: string[] }[],
  playersByValue: Map<string, string[]>
): EntityProposal[] {
  return groups
    .map((g) => {
      const ids = new Set<string>();
      for (const v of g.variants) for (const id of playersByValue.get(v) ?? []) ids.add(id);
      return {
        canonical: g.canonical,
        variants: g.variants,
        playerIds: [...ids],
        confidence: "high" as const,
      };
    })
    .filter((p) => p.playerIds.length > 0)
    .sort((a, b) => b.playerIds.length - a.playerIds.length);
}

// The full Claude pass: canonicalize coaches + team names and match the
// unresolved buddy requests, all in parallel. Returns proposals only — nothing
// is persisted until the user confirms via applyResolution.
export async function runClaudePass(seasonId: string): Promise<ClaudePassResult> {
  const { supabase } = await requireOwner();

  const rows = await selectAll((from, to) =>
    supabase
      .from("tb_players")
      .select(
        "id, first_name, last_name, gender, age_group, package_name, school, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights"
      )
      .eq("season_id", seasonId)
      .order("id")
      .range(from, to)
  );
  const empty: ClaudePassResult = { coaches: [], teams: [], buddyLinks: [] };
  if (rows.length === 0) return empty;

  const idOf = (p: Record<string, unknown>) => p.id as string;
  const nameById = new Map(
    rows.map((p) => [idOf(p), `${p.first_name} ${p.last_name}`.trim()])
  );

  // Distinct coach / team values → the players that used each value.
  const coachByValue = new Map<string, string[]>();
  const teamByValue = new Map<string, string[]>();
  for (const p of rows) {
    const c = coachValue(p);
    if (c) (coachByValue.get(c) ?? coachByValue.set(c, []).get(c)!).push(idOf(p));
    const t = (p.team_name as string)?.trim();
    if (t && !isNoRequest(t)) (teamByValue.get(t) ?? teamByValue.set(t, []).get(t)!).push(idOf(p));
  }
  const coachValues = [...coachByValue.entries()].map(([value, ids]) => ({ value, count: ids.length }));
  const teamValues = [...teamByValue.entries()].map(([value, ids]) => ({ value, count: ids.length }));

  // Unresolved buddy requests (from the deterministic pass).
  const inputs: PlayerInput[] = rows.map((p) => {
    const record = {} as CanonicalRecord;
    for (const f of FIELD_DEFS) record[f.key] = ((p as Record<string, unknown>)[f.key] as string) ?? "";
    return { id: idOf(p), record };
  });
  const proposal = buildProposal(inputs);
  const unresolvedIds = new Set(proposal.buddies.filter((b) => b.toId === null).map((b) => b.fromId));
  const buddyRequests = rows
    .filter((p) => unresolvedIds.has(idOf(p)))
    .map((p) => ({
      id: idOf(p),
      name: nameById.get(idOf(p)) ?? "",
      rawText: [p.buddy_first, p.buddy_last].filter((v) => v && !isNoRequest(v as string)).join(" ").trim(),
    }))
    .filter((r) => r.rawText);
  const roster = rows.map((p) => ({ id: idOf(p), name: nameById.get(idOf(p)) ?? "" }));

  try {
    const [coachGroups, teamGroups, buddyMatches] = await Promise.all([
      canonicalizeEntities("coach", coachValues),
      canonicalizeEntities("team", teamValues),
      matchBuddiesWithClaude(buddyRequests, roster),
    ]);

    const rawById = new Map(buddyRequests.map((r) => [r.id, r.rawText]));
    const buddyLinks: SuggestedBuddyLink[] = [];
    for (const m of buddyMatches) {
      for (const toId of m.buddyIds) {
        buddyLinks.push({
          fromId: m.requesterId,
          fromName: nameById.get(m.requesterId) ?? "",
          toId,
          toName: nameById.get(toId) ?? "",
          rawName: rawById.get(m.requesterId) ?? "",
        });
      }
    }

    return {
      coaches: groupsToProposals(coachGroups, coachByValue),
      teams: groupsToProposals(teamGroups, teamByValue),
      buddyLinks,
    };
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : "Claude request failed." };
  }
}

// ── Analyze ──────────────────────────────────────────────────────────────────
// The streaming version lives in the /analyze SSE route (real progress). This
// non-streaming action is kept for any caller that just wants the result.
export async function analyzeSeason(seasonId: string) {
  const { supabase } = await requireOwner();
  return runAnalysis(supabase, seasonId);
}

// Pick a specific coach for a player from the ambiguous options.
export async function setPlayerCoach(seasonId: string, playerId: string, coachName: string) {
  const { supabase } = await requireOwner();
  const name = coachName.trim();
  if (!name) return;
  const { data: existing } = await supabase
    .from("tb_coaches")
    .select("id")
    .eq("season_id", seasonId)
    .eq("name", name)
    .maybeSingle();
  let coachId = existing?.id as string | undefined;
  if (!coachId) {
    const { data: created, error } = await supabase
      .from("tb_coaches")
      .insert({ season_id: seasonId, name })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    coachId = created.id as string;
  }
  const { error: upErr } = await supabase.from("tb_players").update({ resolved_coach_id: coachId }).eq("id", playerId);
  if (upErr) throw new Error(upErr.message);
  revalidatePath(`/tools/roster-creator/${seasonId}`);
}

// ── Grouping (Phase 3) ───────────────────────────────────────────────────────

export async function updateGroupingConfig(seasonId: string, config: GroupConfig) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_seasons")
    .update({ grouping_config: config, updated_at: new Date().toISOString() })
    .eq("id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

// Assign players into the FIXED set of teams that came from the coach workbook.
// Teams themselves persist (they carry their coach + schedule) — regenerating
// only reshuffles player → team assignments. Idempotent: clears prior player
// assignments first, never deletes teams.
export async function generateTeams(seasonId: string, config?: GroupConfig) {
  const { supabase } = await requireOwner();

  const cfg = normalizeConfig(config);
  if (config) {
    await supabase.from("tb_seasons").update({ grouping_config: config }).eq("id", seasonId);
  }

  const [{ data: divisions }, { data: teamRows }, players, links, { data: coaches }] =
    await Promise.all([
      supabase
        .from("tb_divisions")
        .select("id, name, position, target_team_size")
        .eq("season_id", seasonId)
        .order("position"),
      supabase
        .from("tb_teams")
        .select("id, division_id, coach_id, is_placeholder, practice_night, position")
        .eq("season_id", seasonId)
        .order("position"),
      selectAll((from, to) =>
        supabase
          .from("tb_players")
          .select("id, last_name, division_id, resolved_coach_id, practice_nights, raw, team_name")
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
    ]);

  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));

  // Undirected buddy adjacency.
  const buddies = new Map<string, Set<string>>();
  const addBuddy = (a: string, b: string) => {
    if (!buddies.has(a)) buddies.set(a, new Set());
    buddies.get(a)!.add(b);
  };
  for (const l of links) {
    addBuddy(l.from_player_id as string, l.to_player_id as string);
    addBuddy(l.to_player_id as string, l.from_player_id as string);
  }

  const rows = players;
  const divisionOf = new Map(rows.map((p) => [p.id as string, p.division_id as string | null]));
  const reqTeamName = new Map(rows.map((p) => [p.id as string, ((p.team_name as string) ?? "").trim()]));

  // If a team's members agree on a team name (≥3 asked for the same one), use it
  // as the team's name — the coach link stays attached.
  function consensusName(playerIds: string[]): string | null {
    const counts = new Map<string, { count: number; display: string }>();
    for (const pid of playerIds) {
      const tn = reqTeamName.get(pid) ?? "";
      if (!tn || isNoRequest(tn)) continue;
      const key = normalize(tn);
      if (!key) continue;
      const e = counts.get(key) ?? { count: 0, display: tn };
      e.count++;
      counts.set(key, e);
    }
    let best: { count: number; display: string } | null = null;
    for (const e of counts.values()) if (!best || e.count > best.count) best = e;
    return best && best.count >= 3 ? best.display : null;
  }

  // Reset prior assignments (regenerate). Teams PERSIST — only players move.
  await supabase.from("tb_players").update({ team_id: null }).eq("season_id", seasonId);

  // The authoritative, fixed teams, grouped by division.
  type DivTeam = { id: string; coachId: string | null; isPlaceholder: boolean; night: string | null };
  const teamsByDivision = new Map<string, DivTeam[]>();
  for (const t of teamRows ?? []) {
    const dz = t.division_id as string;
    if (!teamsByDivision.has(dz)) teamsByDivision.set(dz, []);
    teamsByDivision.get(dz)!.push({
      id: t.id as string,
      coachId: (t.coach_id as string | null) ?? null,
      isPlaceholder: !!t.is_placeholder,
      night: (t.practice_night as string | null) ?? null,
    });
  }

  for (const division of divisions ?? []) {
    const members = rows.filter((p) => p.division_id === division.id);
    const fixedTeams = teamsByDivision.get(division.id as string) ?? [];
    if (fixedTeams.length === 0 || members.length === 0) continue;

    // A coach whose OWN child is enrolled here runs an inviolable team. Detect
    // it: the account that registered the player matches the coach they
    // requested. assignDivision keeps their kids on that team, no exception.
    const protectedCoachIds = new Set<string>();
    for (const p of members) {
      const cid = p.resolved_coach_id as string | null;
      if (!cid) continue;
      if (isCoachChild((p.last_name as string) ?? "", accountNameOf(p.raw), coachName.get(cid) ?? "")) {
        protectedCoachIds.add(cid);
      }
    }

    const groupPlayers: GroupPlayer[] = members.map((p) => ({
      id: p.id as string,
      coachId: (p.resolved_coach_id as string | null) ?? null,
      teamNameId: null,
      nights: parseNights((p.practice_nights as string) ?? ""),
      // Restrict buddies to same-division players (cross-division ones can't share a team).
      buddyIds: [...(buddies.get(p.id as string) ?? [])].filter(
        (id) => divisionOf.get(id) === division.id
      ),
    }));

    const targetSize = (division.target_team_size as number | null) ?? cfg.target;
    const { assignments } = assignDivision({
      teams: fixedTeams.map((t) => ({ id: t.id, coachId: t.coachId, isPlaceholder: t.isPlaceholder })),
      players: groupPlayers,
      targetSize,
      protectedCoachIds,
    });

    const currentNight = new Map(fixedTeams.map((t) => [t.id, t.night]));
    for (const a of assignments) {
      if (a.playerIds.length > 0) {
        const { error } = await supabase.from("tb_players").update({ team_id: a.teamId }).in("id", a.playerIds);
        if (error) throw new Error(error.message);
      }
      // Suggest a practice night only when the team has none yet — never clobber
      // a night the coach already set in the schedule builder.
      if (a.night && !currentNight.get(a.teamId)) {
        const { error } = await supabase.from("tb_teams").update({ practice_night: a.night }).eq("id", a.teamId);
        if (error) throw new Error(error.message);
      }
      // Name the team by member consensus when there is one.
      const name = consensusName(a.playerIds);
      if (name) {
        const { error } = await supabase.from("tb_teams").update({ name }).eq("id", a.teamId);
        if (error) throw new Error(error.message);
      }
    }
  }

  await supabase.from("tb_seasons").update({ status: "grouped" }).eq("id", seasonId);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

export async function movePlayerToTeam(
  seasonId: string,
  playerId: string,
  teamId: string | null
) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("tb_players").update({ team_id: teamId }).eq("id", playerId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

export async function renameTeam(seasonId: string, teamId: string, name: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_teams")
    .update({ name: name.trim() || "Untitled team" })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

export async function setTeamNight(seasonId: string, teamId: string, night: string | null) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_teams")
    .update({ practice_night: night })
    .eq("id", teamId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

export async function addTeam(seasonId: string, divisionId: string, name: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_teams")
    .insert({ season_id: seasonId, division_id: divisionId, name: name.trim() || "New team", position: 999 });
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/teams`);
}

// ── Export (Phase 4) ─────────────────────────────────────────────────────────

export async function exportRosterCsv(seasonId: string): Promise<string> {
  const { supabase } = await requireOwner();
  const rows = await fetchRosterRows(supabase, seasonId);
  return rosterToCsv(rows);
}

export async function emailRoster(
  seasonId: string,
  toEmail: string,
  note?: string
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireOwner();
  const email = toEmail.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: "RESEND_API_KEY is not configured." };
  }

  const { data: season } = await supabase.from("tb_seasons").select("name").eq("id", seasonId).maybeSingle();
  const seasonName = (season?.name as string) ?? "Season";
  const rows = await fetchRosterRows(supabase, seasonId);
  const csv = rosterToCsv(rows);

  const teamCount = new Set(rows.filter((r) => r.team !== "Unassigned").map((r) => `${r.division}/${r.team}`)).size;
  const html =
    `<p>Attached are the rosters for <strong>${seasonName}</strong>.</p>` +
    `<p>${rows.length} players across ${teamCount} teams.</p>` +
    (note?.trim() ? `<p>${note.trim()}</p>` : "");

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const from = `${process.env.EMAIL_FROM_NAME ?? "CS Sports"} <${process.env.EMAIL_FROM ?? "onboarding@resend.dev"}>`;
    const { error } = await resend.emails.send({
      from,
      to: email,
      subject: `Rosters — ${seasonName}`,
      html,
      text: `Rosters for ${seasonName}. ${rows.length} players across ${teamCount} teams. CSV attached.`,
      attachments: [
        {
          filename: `${seasonName.replace(/[^a-z0-9]+/gi, "-")}-rosters.csv`,
          content: Buffer.from(csv).toString("base64"),
        },
      ],
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to send email." };
  }
}

// ── Setup wizard: blank season + full structure / player editing ──────────────

// Create an EMPTY season (no divisions/coaches/teams) — the start of the manual
// setup flow. Structure is then added in the editor (by hand or by upload).
export async function createSeason(name: string, sport?: string): Promise<string> {
  const { supabase } = await requireOwner();
  const { data, error } = await supabase
    .from("tb_seasons")
    .insert({
      name: name.trim() || "Untitled season",
      sport: sport?.trim() || null,
      grouping_config: { target: 12 },
      status: "structured",
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create season");
  revalidatePath("/tools/roster-creator");
  return data.id as string;
}

export async function renameDivision(seasonId: string, divisionId: string, name: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_divisions")
    .update({ name: name.trim() || "Untitled division" })
    .eq("id", divisionId)
    .eq("season_id", seasonId);
  if (error) {
    if (error.code === "23505") throw new Error("A division with that name already exists");
    throw new Error(error.message);
  }
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

export async function deleteDivision(seasonId: string, divisionId: string) {
  const { supabase } = await requireOwner();
  // Players in it keep their record but lose the (now-gone) division; teams cascade.
  await supabase
    .from("tb_players")
    .update({ division_id: null, team_id: null })
    .eq("season_id", seasonId)
    .eq("division_id", divisionId);
  const { error } = await supabase.from("tb_divisions").delete().eq("id", divisionId).eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

// Find an existing coach by name in the season, else create one. Returns its id.
async function coachIdForName(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  seasonId: string,
  name: string
): Promise<string> {
  const n = name.trim();
  const { data: existing } = await supabase
    .from("tb_coaches")
    .select("id")
    .eq("season_id", seasonId)
    .eq("name", n)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data, error } = await supabase
    .from("tb_coaches")
    .insert({ season_id: seasonId, name: n })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create coach");
  return data.id as string;
}

async function nextTeamPosition(
  supabase: Awaited<ReturnType<typeof requireOwner>>["supabase"],
  divisionId: string
): Promise<number> {
  const { count } = await supabase
    .from("tb_teams")
    .select("id", { count: "exact", head: true })
    .eq("division_id", divisionId);
  return count ?? 0;
}

// Add a coached team (a coach name) to a division.
export async function addCoachTeam(seasonId: string, divisionId: string, coachName: string) {
  const { supabase } = await requireOwner();
  const n = coachName.trim();
  if (!n) throw new Error("Coach name is required");
  const coachId = await coachIdForName(supabase, seasonId, n);
  const position = await nextTeamPosition(supabase, divisionId);
  const { error } = await supabase.from("tb_teams").insert({
    season_id: seasonId,
    division_id: divisionId,
    name: n,
    coach_id: coachId,
    is_placeholder: false,
    position,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

// Add an open "Team N" placeholder slot to a division.
export async function addPlaceholderTeam(seasonId: string, divisionId: string) {
  const { supabase } = await requireOwner();
  const position = await nextTeamPosition(supabase, divisionId);
  const { error } = await supabase.from("tb_teams").insert({
    season_id: seasonId,
    division_id: divisionId,
    name: `Team ${position + 1}`,
    coach_id: null,
    is_placeholder: true,
    position,
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

// Edit a team's coach. Empty name turns it into an open placeholder slot.
export async function updateTeamCoach(seasonId: string, teamId: string, coachName: string) {
  const { supabase } = await requireOwner();
  const n = coachName.trim();
  if (n) {
    const coachId = await coachIdForName(supabase, seasonId, n);
    const { error } = await supabase
      .from("tb_teams")
      .update({ coach_id: coachId, name: n, is_placeholder: false })
      .eq("id", teamId)
      .eq("season_id", seasonId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("tb_teams")
      .update({ coach_id: null, is_placeholder: true })
      .eq("id", teamId)
      .eq("season_id", seasonId);
    if (error) throw new Error(error.message);
  }
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

export async function deleteTeam(seasonId: string, teamId: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("tb_teams").delete().eq("id", teamId).eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

export async function setTeamPracticeNight(seasonId: string, teamId: string, night: string | null) {
  const { supabase } = await requireOwner();
  const { error } = await supabase
    .from("tb_teams")
    .update({ practice_night: night })
    .eq("id", teamId)
    .eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

// Bulk-add an uploaded coach workbook into an EXISTING season (merges by name).
export async function addRosterToSeason(
  seasonId: string,
  divisions: CreateSeasonFromRosterInput["divisions"]
) {
  const { supabase } = await requireOwner();
  const defaultSize = 12;

  const { data: exDiv } = await supabase.from("tb_divisions").select("id, name").eq("season_id", seasonId);
  const divIdByName = new Map<string, string>((exDiv ?? []).map((d) => [d.name as string, d.id as string]));
  let pos = (exDiv ?? []).length;

  const coachNames = [
    ...new Set(
      divisions
        .flatMap((d) => d.teams)
        .filter((t) => !t.isPlaceholder && t.coachName)
        .map((t) => t.coachName!.trim())
        .filter(Boolean)
    ),
  ];
  const coachIdByName = new Map<string, string>();
  const { data: exCoaches } = await supabase.from("tb_coaches").select("id, name").eq("season_id", seasonId);
  (exCoaches ?? []).forEach((c) => coachIdByName.set(c.name as string, c.id as string));
  const toCreate = coachNames.filter((n) => !coachIdByName.has(n));
  if (toCreate.length > 0) {
    const { data, error } = await supabase
      .from("tb_coaches")
      .insert(toCreate.map((name) => ({ season_id: seasonId, name })))
      .select("id, name");
    if (error) throw new Error(error.message);
    (data ?? []).forEach((c) => coachIdByName.set(c.name as string, c.id as string));
  }

  for (const d of divisions) {
    const dn = d.name.trim();
    let divId = divIdByName.get(dn);
    if (!divId) {
      const { data: div, error } = await supabase
        .from("tb_divisions")
        .insert({
          season_id: seasonId,
          name: dn || `Division ${pos + 1}`,
          position: pos++,
          target_team_size: Math.max(1, Math.round(d.targetTeamSize || defaultSize)),
        })
        .select("id")
        .single();
      if (error || !div) throw new Error(error?.message ?? "Failed to create division");
      divId = div.id as string;
      divIdByName.set(dn, divId);
    }
    let tp = await nextTeamPosition(supabase, divId);
    const teamRows = d.teams.map((t) => {
      const cn = (t.coachName ?? "").trim();
      const p = tp++;
      return {
        season_id: seasonId,
        division_id: divId,
        name: t.isPlaceholder ? t.rawLabel.trim() || `Team ${p + 1}` : cn || `Team ${p + 1}`,
        coach_id: t.isPlaceholder ? null : coachIdByName.get(cn) ?? null,
        is_placeholder: t.isPlaceholder,
        position: p,
      };
    });
    if (teamRows.length > 0) {
      const { error } = await supabase.from("tb_teams").insert(teamRows);
      if (error) throw new Error(error.message);
    }
  }
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}

// ── Player editing (add / edit / remove) ─────────────────────────────────────

export type PlayerFields = {
  first_name: string;
  last_name: string;
  gender?: string;
  age_group?: string;
  school?: string;
  coach_first?: string;
  coach_last?: string;
  team_name?: string;
  buddy_first?: string;
  buddy_last?: string;
  practice_nights?: string;
};

export async function addPlayer(seasonId: string, divisionId: string | null, f: PlayerFields) {
  const { supabase } = await requireOwner();
  if (!f.first_name.trim() && !f.last_name.trim()) throw new Error("A player name is required");
  const { error } = await supabase.from("tb_players").insert({
    season_id: seasonId,
    division_id: divisionId,
    first_name: f.first_name.trim(),
    last_name: f.last_name.trim(),
    gender: f.gender ?? "",
    age_group: f.age_group ?? "",
    school: f.school ?? "",
    coach_first: f.coach_first ?? "",
    coach_last: f.coach_last ?? "",
    team_name: f.team_name ?? "",
    buddy_first: f.buddy_first ?? "",
    buddy_last: f.buddy_last ?? "",
    practice_nights: f.practice_nights ?? "",
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/players`);
}

export async function updatePlayer(
  seasonId: string,
  playerId: string,
  f: Partial<PlayerFields> & { division_id?: string | null }
) {
  const { supabase } = await requireOwner();
  const keys = [
    "first_name", "last_name", "gender", "age_group", "school",
    "coach_first", "coach_last", "team_name", "buddy_first", "buddy_last",
    "practice_nights", "division_id",
  ] as const;
  const patch: Record<string, unknown> = {};
  for (const k of keys) if (k in f) patch[k] = (f as Record<string, unknown>)[k];
  if (Object.keys(patch).length === 0) return;
  const { error } = await supabase.from("tb_players").update(patch).eq("id", playerId).eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/players`);
}

export async function deletePlayer(seasonId: string, playerId: string) {
  const { supabase } = await requireOwner();
  const { error } = await supabase.from("tb_players").delete().eq("id", playerId).eq("season_id", seasonId);
  if (error) throw new Error(error.message);
  revalidatePath(`/tools/roster-creator/${seasonId}/players`);
}

// Delete EVERY season the owner has (cascades to divisions, teams, coaches,
// players, buddy links, imports). Destructive — the UI confirms first. Returns
// the result rather than throwing so any DB error surfaces (Next sanitizes
// thrown server-action errors to a generic message in production).
export async function deleteAllSeasons(): Promise<{ ok: boolean; error?: string }> {
  try {
    const { supabase } = await requireOwner();
    // Mirror the working single-delete path: select the owner's ids (RLS-scoped)
    // then delete by id, one season at a time so one bad row can't fail them all.
    const { data: seasons, error: selErr } = await supabase.from("tb_seasons").select("id");
    if (selErr) return { ok: false, error: selErr.message };
    const ids = (seasons ?? []).map((s) => s.id as string);
    for (const id of ids) {
      const { error } = await supabase.from("tb_seasons").delete().eq("id", id);
      if (error) return { ok: false, error: `Season ${id}: ${error.message}` };
    }
    revalidatePath("/tools/roster-creator");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to delete seasons." };
  }
}

// Set a division's TOTAL team count by adding/removing open placeholder slots to
// match. Coached teams are never removed — the count is clamped to at least the
// number of coaches (remove a coach individually to go lower).
export async function setDivisionTeamCount(seasonId: string, divisionId: string, count: number) {
  const { supabase } = await requireOwner();
  const { data: teams, error: selErr } = await supabase
    .from("tb_teams")
    .select("id, is_placeholder, position")
    .eq("division_id", divisionId)
    .order("position");
  if (selErr) throw new Error(selErr.message);
  const list = teams ?? [];
  const coachedCount = list.filter((t) => !t.is_placeholder).length;
  const placeholders = list.filter((t) => t.is_placeholder);
  const current = list.length;
  const desired = Math.max(Math.round(count) || 0, coachedCount);

  if (desired > current) {
    const rows = [];
    for (let i = current; i < desired; i++) {
      rows.push({
        season_id: seasonId,
        division_id: divisionId,
        name: `Team ${i + 1}`,
        coach_id: null,
        is_placeholder: true,
        position: i,
      });
    }
    const { error } = await supabase.from("tb_teams").insert(rows);
    if (error) throw new Error(error.message);
  } else if (desired < current) {
    // Drop the trailing open slots (highest positions first).
    const toRemove = placeholders.slice(placeholders.length - (current - desired)).map((t) => t.id as string);
    if (toRemove.length > 0) {
      const { error } = await supabase.from("tb_teams").delete().in("id", toRemove);
      if (error) throw new Error(error.message);
    }
  }
  revalidatePath(`/tools/roster-creator/${seasonId}/setup`);
}
