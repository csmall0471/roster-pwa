"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseCsvObjects } from "@/lib/csv";
import { phoneKey } from "@/lib/phone";

// ── Shapes shared with the client ─────────────────────────────────────────────
export type CsvRowPlan = {
  row: number;
  name: string;
  externalId: string | null;
  status: "create" | "update" | "unchanged" | "ambiguous";
  changes: string[];
  note?: string;
};

export type CsvImportPlan = {
  rows: CsvRowPlan[];
  counts: { create: number; update: number; unchanged: number; ambiguous: number };
  teamName: string | null; // team named in the file
  matchedTeamId: string | null; // existing team whose name matches it
  errors: string[];
};

export type ApplyCsvResult = {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  addedToTeam: number;
  errors: string[];
};

// ── Normalized incoming record ────────────────────────────────────────────────
type IncomingParent = { first_name: string; last_name: string; phone: string; email: string } | null;
type Incoming = {
  externalId: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  dob: string | null; // YYYY-MM-DD
  jersey: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  team: string;
  parents: NonNullable<IncomingParent>[];
};

const normName = (f: string, l: string) => `${f} ${l}`.toLowerCase().replace(/\s+/g, " ").trim();

// Accept "YYYY-MM-DD" or "M/D/YYYY"; anything else → null (left untouched).
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

// Map one CSV row (keyed by lower-cased header) to our normalized shape.
function rowToIncoming(o: Record<string, string>): Incoming | null {
  const first = (o["player_first_name"] ?? "").trim();
  const last = (o["player_last_name"] ?? "").trim();
  const externalId = (o["id"] ?? "").trim();
  if (!first && !externalId) return null; // nothing usable

  const g = (o["gender"] ?? "").trim().toUpperCase();
  const mkParent = (n: 1 | 2): IncomingParent => {
    const f = (o[`parent${n}_first_name`] ?? "").trim();
    const l = (o[`parent${n}_last_name`] ?? "").trim();
    const email = (o[`parent${n}_email`] ?? "").trim();
    const phone = (o[`parent${n}_mobile_number`] ?? "").trim();
    return f || l || email || phone ? { first_name: f, last_name: l, phone, email } : null;
  };

  return {
    externalId,
    first_name: first,
    last_name: last,
    gender: g || null,
    dob: normalizeDate(o["birth_date"] ?? ""),
    jersey: (o["number"] ?? "").trim() || null,
    street: (o["street"] ?? "").trim() || null,
    city: (o["city"] ?? "").trim() || null,
    state: (o["state"] ?? "").trim() || null,
    zip: (o["zip"] ?? "").trim() || null,
    team: (o["team"] ?? "").trim(),
    parents: [mkParent(1), mkParent(2)].filter((p): p is NonNullable<IncomingParent> => !!p),
  };
}

type ExistingParent = { id: string; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
type ExistingPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  date_of_birth: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  external_id: string | null;
  parents: ExistingParent[];
};

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function loadExisting(supabase: SupabaseClient, userId: string): Promise<ExistingPlayer[]> {
  const { data: rows } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, gender, date_of_birth, street, city, state, zip, external_id, player_parents(parents(id, first_name, last_name, phone, email))"
    )
    .eq("user_id", userId);
  return (rows ?? []).map((r) => {
    const rr = r as unknown as ExistingPlayer & { player_parents: { parents: ExistingParent | null }[] };
    return {
      id: rr.id,
      first_name: rr.first_name,
      last_name: rr.last_name,
      gender: rr.gender,
      date_of_birth: rr.date_of_birth,
      street: rr.street,
      city: rr.city,
      state: rr.state,
      zip: rr.zip,
      external_id: rr.external_id,
      parents: (rr.player_parents ?? []).map((pp) => pp.parents).filter(Boolean) as ExistingParent[],
    };
  });
}

function buildIndex(existing: ExistingPlayer[]) {
  const byExternal = new Map<string, ExistingPlayer>();
  const byName = new Map<string, ExistingPlayer[]>();
  for (const p of existing) {
    if (p.external_id) byExternal.set(p.external_id, p);
    const k = normName(p.first_name, p.last_name);
    const list = byName.get(k) ?? [];
    list.push(p);
    byName.set(k, list);
  }
  return { byExternal, byName };
}

type MatchResult =
  | { kind: "match"; player: ExistingPlayer; matchBy: "external_id" | "name" }
  | { kind: "create" }
  | { kind: "ambiguous"; count: number };

function matchIncoming(inc: Incoming, idx: ReturnType<typeof buildIndex>): MatchResult {
  if (inc.externalId && idx.byExternal.has(inc.externalId)) {
    return { kind: "match", player: idx.byExternal.get(inc.externalId)!, matchBy: "external_id" };
  }
  const named = idx.byName.get(normName(inc.first_name, inc.last_name)) ?? [];
  if (named.length === 0) return { kind: "create" };
  if (named.length === 1) return { kind: "match", player: named[0], matchBy: "name" };
  // Multiple same-name players — try to disambiguate by DOB.
  if (inc.dob) {
    const byDob = named.filter((p) => p.date_of_birth === inc.dob);
    if (byDob.length === 1) return { kind: "match", player: byDob[0], matchBy: "name" };
  }
  return { kind: "ambiguous", count: named.length };
}

// The player-field patch, applying only non-empty incoming values that differ
// (never blanks out an existing value). Also returns human-readable labels.
function playerPatch(match: ExistingPlayer, inc: Incoming) {
  const patch: Record<string, unknown> = {};
  const labels: string[] = [];
  const setIf = (field: string, incVal: string | null, existing: string | null, label: string) => {
    const v = (incVal ?? "").trim();
    if (!v || v === (existing ?? "").trim()) return;
    patch[field] = v;
    labels.push(label);
  };
  setIf("first_name", inc.first_name, match.first_name, "First name");
  setIf("last_name", inc.last_name, match.last_name, "Last name");
  setIf("gender", inc.gender, match.gender, "Gender");
  setIf("date_of_birth", inc.dob, match.date_of_birth, "DOB");

  let addrChanged = false;
  const addr = (field: "street" | "city" | "state" | "zip", incVal: string | null) => {
    const v = (incVal ?? "").trim();
    if (!v || v === ((match[field] as string | null) ?? "").trim()) return;
    patch[field] = v;
    addrChanged = true;
  };
  addr("street", inc.street);
  addr("city", inc.city);
  addr("state", inc.state);
  addr("zip", inc.zip);
  if (addrChanged) labels.push("Address");

  return { patch, labels };
}

// Which incoming parents aren't yet linked to this player (by phone/email)?
function newParents(match: ExistingPlayer, inc: Incoming): NonNullable<IncomingParent>[] {
  const fresh: NonNullable<IncomingParent>[] = [];
  for (const ip of inc.parents) {
    if (!ip) continue;
    const pk = phoneKey(ip.phone);
    const em = ip.email.trim().toLowerCase();
    const linked = match.parents.some(
      (ep) => (pk && phoneKey(ep.phone) === pk) || (em && (ep.email ?? "").trim().toLowerCase() === em)
    );
    if (!linked) fresh.push(ip);
  }
  return fresh;
}

const parentLabel = (p: NonNullable<IncomingParent>) =>
  `${p.first_name} ${p.last_name}`.trim() || p.phone || p.email;

// roster.jersey_number is a smallint; coerce the CSV's text value or drop it.
function toJersey(s: string | null): number | null {
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) && n >= 0 && n <= 32767 ? n : null;
}

// ── Analyze ───────────────────────────────────────────────────────────────────
export async function analyzeCsvImport(csvText: string): Promise<CsvImportPlan> {
  const empty: CsvImportPlan = {
    rows: [],
    counts: { create: 0, update: 0, unchanged: 0, ambiguous: 0 },
    teamName: null,
    matchedTeamId: null,
    errors: [],
  };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, errors: ["Not authenticated."] };
  if (!csvText?.trim()) return { ...empty, errors: ["Upload or paste a CSV first."] };

  const objects = parseCsvObjects(csvText);
  if (objects.length === 0) return { ...empty, errors: ["No rows found. Is the header row present?"] };
  if (!("player_first_name" in objects[0]) && !("id" in objects[0])) {
    return {
      ...empty,
      errors: ["Couldn't find the expected columns (player_first_name, id, …). Is this the league export?"],
    };
  }

  const errors: string[] = [];
  const incoming: Incoming[] = [];
  objects.forEach((o, i) => {
    const inc = rowToIncoming(o);
    if (inc) incoming.push(inc);
    else errors.push(`Row ${i + 2}: missing a player name.`);
  });

  const existing = await loadExisting(supabase, user.id);
  const idx = buildIndex(existing);

  const rows: CsvRowPlan[] = incoming.map((inc, i) => {
    const name = `${inc.first_name} ${inc.last_name}`.trim() || `Row ${i + 2}`;
    const res = matchIncoming(inc, idx);
    if (res.kind === "create") {
      return { row: i + 2, name, externalId: inc.externalId || null, status: "create", changes: [] };
    }
    if (res.kind === "ambiguous") {
      return {
        row: i + 2,
        name,
        externalId: inc.externalId || null,
        status: "ambiguous",
        changes: [],
        note: `${res.count} players already share this name — edit them first or add a birth date to tell them apart.`,
      };
    }
    const { labels } = playerPatch(res.player, inc);
    const changes = [...labels];
    for (const p of newParents(res.player, inc)) changes.push(`+ ${parentLabel(p)}`);
    if (res.matchBy === "name" && !res.player.external_id && inc.externalId) changes.push("Registration ID");
    return {
      row: i + 2,
      name,
      externalId: inc.externalId || null,
      status: changes.length > 0 ? "update" : "unchanged",
      changes,
    };
  });

  // Team named in the file (they're usually all the same); match to an existing one.
  const teamName = incoming.find((x) => x.team)?.team ?? null;
  let matchedTeamId: string | null = null;
  if (teamName) {
    const { data: teams } = await supabase
      .from("teams")
      .select("id, name")
      .eq("user_id", user.id);
    const hit = (teams ?? []).find(
      (t) => (t.name as string).trim().toLowerCase() === teamName.toLowerCase()
    );
    matchedTeamId = (hit?.id as string) ?? null;
  }

  const counts = {
    create: rows.filter((r) => r.status === "create").length,
    update: rows.filter((r) => r.status === "update").length,
    unchanged: rows.filter((r) => r.status === "unchanged").length,
    ambiguous: rows.filter((r) => r.status === "ambiguous").length,
  };
  return { rows, counts, teamName, matchedTeamId, errors };
}

// ── Apply ─────────────────────────────────────────────────────────────────────
async function findOrCreateParent(
  supabase: SupabaseClient,
  userId: string,
  byPhone: Map<string, string>,
  byEmail: Map<string, string>,
  info: NonNullable<IncomingParent>
): Promise<string | null> {
  const pk = phoneKey(info.phone);
  const em = info.email.trim().toLowerCase();
  const existing = (pk && byPhone.get(pk)) || (em && byEmail.get(em)) || null;
  if (existing) return existing;
  const { data } = await supabase
    .from("parents")
    .insert({
      user_id: userId,
      first_name: info.first_name,
      last_name: info.last_name,
      phone: info.phone || null,
      email: info.email || "",
    })
    .select("id")
    .single();
  const id = data?.id ?? null;
  if (id) {
    if (pk) byPhone.set(pk, id);
    if (em) byEmail.set(em, id);
  }
  return id;
}

export async function applyCsvImport(csvText: string, teamId: string | null): Promise<ApplyCsvResult> {
  const result: ApplyCsvResult = { created: 0, updated: 0, unchanged: 0, skipped: 0, addedToTeam: 0, errors: [] };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...result, errors: ["Not authenticated."] };

  const objects = parseCsvObjects(csvText);
  const incoming = objects.map(rowToIncoming).filter((x): x is Incoming => !!x);
  if (incoming.length === 0) return { ...result, errors: ["No usable rows in that CSV."] };

  const existing = await loadExisting(supabase, user.id);
  const idx = buildIndex(existing);

  // Parent dedupe caches.
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const p of existing.flatMap((e) => e.parents)) {
    const k = phoneKey(p.phone);
    if (k) byPhone.set(k, p.id);
    const e = (p.email ?? "").trim().toLowerCase();
    if (e) byEmail.set(e, p.id);
  }

  const linkParent = async (playerId: string, parentId: string) => {
    await supabase.from("player_parents").upsert(
      { player_id: playerId, parent_id: parentId, user_id: user.id, relationship: "parent" },
      { onConflict: "player_id,parent_id", ignoreDuplicates: true }
    );
  };

  // playerId → jersey number to set on the roster (when a team is chosen).
  const affected = new Map<string, number | null>();

  for (const inc of incoming) {
    const res = matchIncoming(inc, idx);

    if (res.kind === "ambiguous") {
      result.skipped++;
      continue;
    }

    if (res.kind === "create") {
      const { data: player, error } = await supabase
        .from("players")
        .insert({
          user_id: user.id,
          first_name: inc.first_name,
          last_name: inc.last_name,
          gender: inc.gender,
          date_of_birth: inc.dob,
          street: inc.street,
          city: inc.city,
          state: inc.state,
          zip: inc.zip,
          external_id: inc.externalId || null,
        })
        .select("id, first_name, last_name, gender, date_of_birth, street, city, state, zip, external_id")
        .single();
      if (error || !player) {
        result.errors.push(`${inc.first_name} ${inc.last_name}: ${error?.message ?? "could not create"}`);
        continue;
      }
      result.created++;
      const created: ExistingPlayer = { ...(player as ExistingPlayer), parents: [] };
      // Keep the index current so a duplicate row in the same file re-uses it.
      idx.byExternal.set(inc.externalId || created.id, created);
      const nk = normName(created.first_name, created.last_name);
      idx.byName.set(nk, [...(idx.byName.get(nk) ?? []), created]);

      for (const ip of inc.parents) {
        const pid = await findOrCreateParent(supabase, user.id, byPhone, byEmail, ip);
        if (pid) {
          await linkParent(created.id, pid);
          created.parents.push({ id: pid, first_name: ip.first_name, last_name: ip.last_name, phone: ip.phone, email: ip.email });
        }
      }
      affected.set(created.id, toJersey(inc.jersey));
      continue;
    }

    // Match → update.
    const match = res.player;
    const { patch } = playerPatch(match, inc);
    if (res.matchBy === "name" && !match.external_id && inc.externalId) patch.external_id = inc.externalId;

    let touched = false;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("players").update(patch).eq("id", match.id).eq("user_id", user.id);
      if (error) {
        result.errors.push(`${inc.first_name} ${inc.last_name}: ${error.message}`);
        continue;
      }
      touched = true;
    }

    for (const ip of newParents(match, inc)) {
      const pid = await findOrCreateParent(supabase, user.id, byPhone, byEmail, ip);
      if (pid) {
        await linkParent(match.id, pid);
        match.parents.push({ id: pid, first_name: ip.first_name, last_name: ip.last_name, phone: ip.phone, email: ip.email });
        touched = true;
      }
    }

    if (touched) result.updated++;
    else result.unchanged++;
    affected.set(match.id, toJersey(inc.jersey));
  }

  // Optional team placement (with jersey numbers) for everyone we resolved.
  if (teamId && affected.size > 0) {
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!team) {
      result.errors.push("Selected team not found.");
    } else {
      const ids = [...affected.keys()];
      const { data: onTeam } = await supabase
        .from("roster")
        .select("player_id")
        .eq("team_id", teamId)
        .eq("user_id", user.id)
        .in("player_id", ids);
      const already = new Set((onTeam ?? []).map((r) => r.player_id as string));

      const toAdd = ids.filter((id) => !already.has(id));
      if (toAdd.length) {
        const { error } = await supabase.from("roster").insert(
          toAdd.map((pid) => ({
            user_id: user.id,
            team_id: teamId,
            player_id: pid,
            status: "active",
            jersey_number: affected.get(pid) || null,
          }))
        );
        if (error) result.errors.push(`Adding to team: ${error.message}`);
        else result.addedToTeam = toAdd.length;
      }
      // Fill jersey numbers for players already on the team that have one incoming.
      for (const pid of ids) {
        if (already.has(pid) && affected.get(pid)) {
          await supabase
            .from("roster")
            .update({ jersey_number: affected.get(pid) })
            .eq("team_id", teamId)
            .eq("player_id", pid)
            .eq("user_id", user.id);
        }
      }
    }
  }

  revalidatePath("/players");
  if (teamId) revalidatePath(`/teams/${teamId}`);
  return result;
}
