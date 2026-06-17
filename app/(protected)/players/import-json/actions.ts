"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { phoneKey } from "@/lib/phone";

// ── Shared shapes (also imported by the client) ────────────────────────────
export type IncomingParent = {
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
} | null;

export type Incoming = {
  externalId: string;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  gender: string | null;
  weight: number | null;
  division: string;
  team: string;
  parent: IncomingParent;
};

export type Diff = {
  key: string; // "first_name" | "last_name" | "shirt_size" | "gender" | "weight" | "parent.name" | "parent.phone" | "parent.email" | "parent.link"
  label: string;
  from: string;
  to: string;
  conflict: boolean; // true = existing value present and differs (needs confirmation)
};

export type PlanItem = {
  key: string;
  status: "create" | "update" | "unchanged" | "ambiguous";
  incoming: Incoming;
  playerId?: string;
  backfillExternal?: boolean;
  parentMatchId?: string | null;
  matchBy?: "external_id" | "name";
  diffs: Diff[];
  candidates?: { id: string; label: string }[];
};

export type ImportPlan = {
  items: PlanItem[];
  errors: string[];
  counts: { create: number; update: number; unchanged: number; ambiguous: number };
};

const SHIRT_SIZES = ["YXS", "YS", "YM", "YL", "YXL", "AXS", "AS", "AM", "AL", "AXL", "AXXL"];

// Registration exports give a verbose label like "Youth Small (Up to 45 lbs)".
// Reduce it to the directory's size codes (YS, AM, …). Returns null if we can't.
function jerseyToShirtSize(raw: unknown): string | null {
  const head = (raw ?? "").toString().split("(")[0].toLowerCase();
  if (!head.trim()) return null;
  const prefix = /adult|men|women/.test(head) ? "A" : "Y";
  let size = "";
  if (/x-?small|\bxs\b/.test(head)) size = "XS";
  else if (/xx-?large|2x|\bxxl\b/.test(head)) size = "XXL";
  else if (/x-?large|\bxl\b/.test(head)) size = "XL";
  else if (/large|\bl\b/.test(head)) size = "L";
  else if (/medium|\bmd?\b/.test(head)) size = "M";
  else if (/small|\bsm?\b/.test(head)) size = "S";
  if (!size) return null;
  const code = prefix + size;
  return SHIRT_SIZES.includes(code) ? code : null;
}

function splitName(full: string): { first: string; last: string } {
  const t = (full ?? "").replace(/\s+/g, " ").trim();
  const i = t.lastIndexOf(" ");
  if (i === -1) return { first: t, last: "" };
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() };
}

const normName = (f: string, l: string) =>
  `${f} ${l}`.toLowerCase().replace(/\s+/g, " ").trim();

const dash = (s: string | number | null | undefined) => {
  const v = s == null ? "" : String(s).trim();
  return v === "" ? "—" : v;
};

// Map one raw registration object into our normalized Incoming shape.
function toIncoming(r: Record<string, unknown>): Incoming | null {
  const externalId = String(r.memberPersonId ?? r.id ?? "").trim();
  const { first, last } = splitName(String(r.playerName ?? ""));
  if (!first && !externalId) return null; // nothing usable

  const genderRaw = String(r.youthGender ?? "").trim().toUpperCase();
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : genderRaw || null;
  const w = Number(r.youthWeight);
  const weight = Number.isFinite(w) && w > 0 ? Math.round(w) : null;

  const pName = splitName(String(r.parentName ?? ""));
  const phone = String(r.parentPrimaryPhoneNumber ?? "").trim();
  const email = String(r.parentEmail ?? "").trim();
  const parent: IncomingParent =
    pName.first || phone || email
      ? { first_name: pName.first, last_name: pName.last, phone, email }
      : null;

  return {
    externalId,
    first_name: first,
    last_name: last,
    shirt_size: jerseyToShirtSize(r.jerseySize),
    gender,
    weight,
    division: String(r.newDivisionName ?? "").trim(),
    team: String(r.teamName ?? "").trim(),
    parent,
  };
}

type ExistingParent = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};
type ExistingPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  gender: string | null;
  weight: number | null;
  external_id: string | null;
  parents: ExistingParent[];
};

// Build the diffs for a record that matched an existing player.
function buildPlayerDiffs(p: ExistingPlayer, inc: Incoming): Diff[] {
  const diffs: Diff[] = [];
  const add = (key: string, label: string, from: unknown, to: unknown) => {
    const f = from == null ? "" : String(from).trim();
    const t = to == null ? "" : String(to).trim();
    if (t === "" || t === f) return; // never blank out, never list no-ops
    diffs.push({ key, label, from: dash(f), to: dash(t), conflict: f !== "" });
  };
  add("first_name", "First name", p.first_name, inc.first_name);
  add("last_name", "Last name", p.last_name, inc.last_name);
  add("shirt_size", "Shirt size", p.shirt_size, inc.shirt_size);
  add("gender", "Gender", p.gender, inc.gender);
  add("weight", "Weight", p.weight, inc.weight);
  return diffs;
}

// Pick the existing linked parent that best matches the incoming one.
function matchParent(parents: ExistingParent[], inc: IncomingParent): ExistingParent | null {
  if (!inc) return null;
  const pk = phoneKey(inc.phone);
  const em = inc.email.trim().toLowerCase();
  return (
    parents.find((p) => pk && phoneKey(p.phone) === pk) ||
    parents.find((p) => em && (p.email ?? "").trim().toLowerCase() === em) ||
    null
  );
}

function buildParentDiffs(matched: ExistingParent | null, inc: IncomingParent): Diff[] {
  if (!inc) return [];
  if (!matched) {
    // No matching parent on this player yet — offer to add/link it.
    const name = `${inc.first_name} ${inc.last_name}`.trim() || inc.phone || inc.email;
    return [{ key: "parent.link", label: "Parent", from: "—", to: name, conflict: false }];
  }
  const diffs: Diff[] = [];
  const exName = `${matched.first_name ?? ""} ${matched.last_name ?? ""}`.replace(/\s+/g, " ").trim();
  const inName = `${inc.first_name} ${inc.last_name}`.replace(/\s+/g, " ").trim();
  if (inName && inName.toLowerCase() !== exName.toLowerCase())
    diffs.push({ key: "parent.name", label: "Parent name", from: dash(exName), to: dash(inName), conflict: exName !== "" });
  if (inc.phone && phoneKey(inc.phone) !== phoneKey(matched.phone))
    diffs.push({ key: "parent.phone", label: "Parent phone", from: dash(matched.phone), to: dash(inc.phone), conflict: (matched.phone ?? "") !== "" });
  const exEmail = (matched.email ?? "").trim();
  if (inc.email && inc.email.toLowerCase() !== exEmail.toLowerCase())
    diffs.push({ key: "parent.email", label: "Parent email", from: dash(exEmail), to: dash(inc.email), conflict: exEmail !== "" });
  return diffs;
}

export async function analyzeJsonImport(raw: string): Promise<ImportPlan> {
  const empty: ImportPlan = { items: [], errors: [], counts: { create: 0, update: 0, unchanged: 0, ambiguous: 0 } };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ...empty, errors: ["Not authenticated."] };

  if (!raw?.trim()) return { ...empty, errors: ["Paste or upload a JSON list of players first."] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...empty, errors: ["That isn't valid JSON. Paste the exported array of player records."] };
  }
  // Accept a bare array or an object that wraps one.
  const arr: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { players?: unknown[] })?.players)
      ? (parsed as { players: unknown[] }).players
      : Array.isArray((parsed as { data?: unknown[] })?.data)
        ? (parsed as { data: unknown[] }).data
        : [];
  if (arr.length === 0) return { ...empty, errors: ["No player records found in that JSON."] };

  const incoming: Incoming[] = [];
  const errors: string[] = [];
  arr.forEach((r, i) => {
    if (r && typeof r === "object") {
      const inc = toIncoming(r as Record<string, unknown>);
      if (inc) incoming.push(inc);
      else errors.push(`Record ${i + 1}: missing a player name.`);
    } else {
      errors.push(`Record ${i + 1}: not an object.`);
    }
  });

  // Existing players (+ their linked parents) for matching.
  const { data: rows } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, shirt_size, gender, weight, external_id, player_parents(parents(id, first_name, last_name, phone, email))"
    )
    .eq("user_id", user.id);

  const existing: ExistingPlayer[] = (rows ?? []).map((r) => {
    const rr = r as unknown as {
      id: string; first_name: string; last_name: string; shirt_size: string | null;
      gender: string | null; weight: number | null; external_id: string | null;
      player_parents: { parents: ExistingParent | null }[];
    };
    return {
      id: rr.id,
      first_name: rr.first_name,
      last_name: rr.last_name,
      shirt_size: rr.shirt_size,
      gender: rr.gender,
      weight: rr.weight,
      external_id: rr.external_id,
      parents: (rr.player_parents ?? []).map((pp) => pp.parents).filter(Boolean) as ExistingParent[],
    };
  });

  const byExternal = new Map<string, ExistingPlayer>();
  const byName = new Map<string, ExistingPlayer[]>();
  for (const p of existing) {
    if (p.external_id) byExternal.set(p.external_id, p);
    const k = normName(p.first_name, p.last_name);
    (byName.get(k) ?? byName.set(k, []).get(k)!).push(p);
  }

  const items: PlanItem[] = incoming.map((inc, idx) => {
    const key = inc.externalId || `row-${idx}`;
    let match: ExistingPlayer | undefined;
    let matchBy: "external_id" | "name" | undefined;

    if (inc.externalId && byExternal.has(inc.externalId)) {
      match = byExternal.get(inc.externalId);
      matchBy = "external_id";
    } else {
      const named = byName.get(normName(inc.first_name, inc.last_name)) ?? [];
      if (named.length === 1) {
        match = named[0];
        matchBy = "name";
      } else if (named.length > 1) {
        return {
          key,
          status: "ambiguous",
          incoming: inc,
          candidates: named.map((p) => ({ id: p.id, label: `${p.first_name} ${p.last_name}`.trim() })),
          diffs: [],
        };
      }
    }

    if (!match) return { key, status: "create", incoming: inc, diffs: [] };

    const parentMatch = matchParent(match.parents, inc.parent);
    const diffs = [...buildPlayerDiffs(match, inc), ...buildParentDiffs(parentMatch, inc.parent)];
    const backfillExternal = matchBy === "name" && !match.external_id && !!inc.externalId;

    return {
      key,
      status: diffs.length === 0 && !backfillExternal ? "unchanged" : "update",
      incoming: inc,
      playerId: match.id,
      parentMatchId: parentMatch?.id ?? null,
      matchBy,
      backfillExternal,
      diffs,
    };
  });

  const counts = {
    create: items.filter((i) => i.status === "create").length,
    update: items.filter((i) => i.status === "update").length,
    unchanged: items.filter((i) => i.status === "unchanged").length,
    ambiguous: items.filter((i) => i.status === "ambiguous").length,
  };
  return { items, errors, counts };
}

// ── Apply ───────────────────────────────────────────────────────────────────
export type CreateInstruction = {
  externalId: string | null;
  first_name: string;
  last_name: string;
  shirt_size: string | null;
  gender: string | null;
  weight: number | null;
  parent: { first_name: string; last_name: string; phone: string; email: string } | null;
};

export type UpdateInstruction = {
  playerId: string;
  externalId: string | null; // backfill when the player has none
  player: Partial<{ first_name: string; last_name: string; shirt_size: string | null; gender: string | null; weight: number | null }>;
  parentUpdate: { parentId: string; first_name?: string; last_name?: string; phone?: string; email?: string } | null;
  parentLink: { first_name: string; last_name: string; phone: string; email: string } | null;
};

export type ApplyResult = { created: number; updated: number; addedToTeam: number; errors: string[] };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function findOrCreateParent(
  supabase: SupabaseClient,
  userId: string,
  byPhone: Map<string, string>,
  byEmail: Map<string, string>,
  info: { first_name: string; last_name: string; phone: string; email: string }
): Promise<string | null> {
  if (!info.first_name && !info.last_name && !info.phone && !info.email) return null;
  const pk = phoneKey(info.phone);
  const em = info.email.trim().toLowerCase();
  let id = (pk && byPhone.get(pk)) || (em && byEmail.get(em)) || null;
  if (id) return id;
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
  id = data?.id ?? null;
  if (id) {
    if (pk) byPhone.set(pk, id);
    if (em) byEmail.set(em, id);
  }
  return id;
}

export async function applyJsonImport(payload: {
  creates: CreateInstruction[];
  updates: UpdateInstruction[];
  teamId: string | null;
}): Promise<ApplyResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { created: 0, updated: 0, addedToTeam: 0, errors: ["Not authenticated."] };

  const errors: string[] = [];
  const affected: string[] = [];

  // Parent dedupe cache (normalized phone / ci-email → parent id).
  const { data: existingParents } = await supabase
    .from("parents")
    .select("id, email, phone")
    .eq("user_id", user.id);
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const p of existingParents ?? []) {
    const k = phoneKey(p.phone as string | null);
    if (k) byPhone.set(k, p.id as string);
    const e = ((p.email as string | null) ?? "").trim().toLowerCase();
    if (e) byEmail.set(e, p.id as string);
  }

  const linkParent = async (playerId: string, parentId: string) => {
    await supabase
      .from("player_parents")
      .upsert(
        { player_id: playerId, parent_id: parentId, user_id: user.id, relationship: "parent" },
        { onConflict: "player_id,parent_id", ignoreDuplicates: true }
      );
  };

  let created = 0;
  for (const c of payload.creates) {
    if (!c.first_name?.trim()) continue;
    const { data: player, error } = await supabase
      .from("players")
      .insert({
        user_id: user.id,
        first_name: c.first_name.trim(),
        last_name: c.last_name?.trim() ?? "",
        shirt_size: c.shirt_size || null,
        gender: c.gender || null,
        weight: c.weight ?? null,
        external_id: c.externalId || null,
      })
      .select("id")
      .single();
    if (error || !player) {
      errors.push(`${c.first_name} ${c.last_name}: ${error?.message ?? "could not create"}`);
      continue;
    }
    affected.push(player.id);
    created++;
    if (c.parent) {
      const pid = await findOrCreateParent(supabase, user.id, byPhone, byEmail, c.parent);
      if (pid) await linkParent(player.id, pid);
    }
  }

  let updated = 0;
  for (const u of payload.updates) {
    const patch: Record<string, unknown> = { ...u.player };
    if (u.externalId) patch.external_id = u.externalId;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from("players").update(patch).eq("id", u.playerId).eq("user_id", user.id);
      if (error) {
        errors.push(`${u.playerId}: ${error.message}`);
        continue;
      }
    }
    if (u.parentUpdate && Object.keys(u.parentUpdate).length > 1) {
      const { parentId, ...fields } = u.parentUpdate;
      await supabase.from("parents").update(fields).eq("id", parentId).eq("user_id", user.id);
    }
    if (u.parentLink) {
      const pid = await findOrCreateParent(supabase, user.id, byPhone, byEmail, u.parentLink);
      if (pid) await linkParent(u.playerId, pid);
    }
    affected.push(u.playerId);
    updated++;
  }

  // Optionally drop everyone touched onto an existing team's roster.
  let addedToTeam = 0;
  if (payload.teamId && affected.length > 0) {
    const ids = [...new Set(affected)];
    const { data: team } = await supabase
      .from("teams")
      .select("id")
      .eq("id", payload.teamId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!team) {
      errors.push("Selected team not found.");
    } else {
      const { data: onTeam } = await supabase
        .from("roster")
        .select("player_id")
        .eq("team_id", payload.teamId)
        .eq("user_id", user.id)
        .in("player_id", ids);
      const already = new Set((onTeam ?? []).map((r) => r.player_id as string));
      const toAdd = ids.filter((id) => !already.has(id));
      if (toAdd.length) {
        const { error } = await supabase
          .from("roster")
          .insert(toAdd.map((pid) => ({ user_id: user.id, team_id: payload.teamId, player_id: pid, status: "active" })));
        if (error) errors.push(`Adding to team: ${error.message}`);
        else addedToTeam = toAdd.length;
      }
    }
  }

  revalidatePath("/players");
  if (payload.teamId) revalidatePath(`/teams/${payload.teamId}`);
  return { created, updated, addedToTeam, errors };
}
