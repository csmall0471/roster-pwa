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
  groupDivision,
  normalizeConfig,
  parseNights,
} from "./group/engine";
import { rosterToCsv } from "./export-csv";
import { fetchRosterRows } from "./roster-data";

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

  // 3. Ensure a division exists for each distinct package_name in the file.
  const records = input.rows.map((row) => canonicalRecord(row, input.columnMapping));
  const packages = [...new Set(records.map(packageOf))];

  const { data: existing } = await supabase
    .from("tb_divisions")
    .select("id, name")
    .eq("season_id", seasonId);
  const divisionIdByName = new Map<string, string>(
    (existing ?? []).map((d) => [d.name as string, d.id as string])
  );

  const toCreate = packages.filter((p) => !divisionIdByName.has(p));
  if (toCreate.length > 0) {
    const basePos = existing?.length ?? 0;
    const { data: created, error: divErr } = await supabase
      .from("tb_divisions")
      .insert(toCreate.map((name, i) => ({ season_id: seasonId, name, position: basePos + i })))
      .select("id, name");
    if (divErr) throw new Error(divErr.message);
    for (const d of created ?? []) divisionIdByName.set(d.name as string, d.id as string);
  }

  // 4. Insert players with materialized canonical fields + their division.
  const players = input.rows.map((row, i) => {
    const rec = records[i];
    return {
      season_id: seasonId,
      import_id: imp.id,
      division_id: divisionIdByName.get(packageOf(rec)) ?? null,
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

// Run the grouping engine for every division and persist the resulting teams +
// player assignments. Idempotent: clears prior teams first (regenerate).
export async function generateTeams(seasonId: string, config?: GroupConfig) {
  const { supabase } = await requireOwner();

  const cfg = normalizeConfig(config);
  if (config) {
    await supabase.from("tb_seasons").update({ grouping_config: config }).eq("id", seasonId);
  }

  const [{ data: divisions }, players, links, { data: coaches }, { data: teamNames }] =
    await Promise.all([
      supabase.from("tb_divisions").select("id, name, position").eq("season_id", seasonId).order("position"),
      selectAll((from, to) =>
        supabase
          .from("tb_players")
          .select("id, last_name, division_id, resolved_coach_id, resolved_team_name_id, practice_nights, raw")
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

  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const teamName = new Map((teamNames ?? []).map((t) => [t.id as string, t.name as string]));

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

  // Wipe prior teams (also nulls team_id via ON DELETE SET NULL).
  await supabase.from("tb_teams").delete().eq("season_id", seasonId);

  for (const division of divisions ?? []) {
    const members = rows.filter((p) => p.division_id === division.id);
    if (members.length === 0) continue;

    // A coach whose OWN child is enrolled here runs a real team that must never
    // be merged away. Detect it: the account that registered the player matches
    // the coach they requested. Their team is then protected in groupDivision.
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
      teamNameId: (p.resolved_team_name_id as string | null) ?? null,
      nights: parseNights((p.practice_nights as string) ?? ""),
      // Restrict buddies to same-division players (cross-division ones can't share a team).
      buddyIds: [...(buddies.get(p.id as string) ?? [])].filter(
        (id) => divisionOf.get(id) === division.id
      ),
    }));

    const grouped = groupDivision(groupPlayers, cfg, protectedCoachIds);

    // Name + persist each team, then assign players.
    let n = 0;
    for (const t of grouped) {
      n++;
      const name = t.teamNameId
        ? teamName.get(t.teamNameId) ?? `Team ${n}`
        : t.coachId
        ? `${coachName.get(t.coachId) ?? "Coach"}'s team`
        : `${division.name} — Team ${n}`;

      const { data: team, error } = await supabase
        .from("tb_teams")
        .insert({
          season_id: seasonId,
          division_id: division.id,
          name,
          practice_night: t.night,
          position: n,
        })
        .select("id")
        .single();
      if (error || !team) throw new Error(error?.message ?? "Failed to create team");

      if (t.playerIds.length > 0) {
        const { error: upErr } = await supabase
          .from("tb_players")
          .update({ team_id: team.id })
          .in("id", t.playerIds);
        if (upErr) throw new Error(upErr.message);
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
