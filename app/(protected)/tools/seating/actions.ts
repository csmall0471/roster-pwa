"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { logToolActivity } from "@/lib/activity";
import { dedupeSiblings } from "@/app/_components/dedupe-siblings";
import { inviteParents } from "@/app/(protected)/events/actions";
import { buildDefaultLayout, clusterSeats, type ClusterShape } from "./layout-seed";

// ── Guard ─────────────────────────────────────────────────────────────────────
// Anyone allowed to USE the Seating tool: the coach who owns teams, or a person
// granted 'seating' via the /access manager. Throws (like roster-creator's
// requireOwner); each action catches and returns { error } so the UI gets a
// readable message instead of an opaque server-action failure.
async function requireSeating(): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string };
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) > 0) return { supabase, user };

  const { data: granted } = await supabase.rpc("has_tool_access", { tool: "seating" });
  if (granted === true) return { supabase, user };

  throw new Error("Not authorized");
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Something went wrong";
}

function revalidatePlan(planId: string) {
  revalidatePath("/tools/seating");
  revalidatePath(`/tools/seating/${planId}`);
}

// ── Plans ─────────────────────────────────────────────────────────────────────

// Seed the default Hideaway Lounge layout into a plan: each zone row, then its
// seats. Sequential inserts are fine — ~15 zones. Shared by createPlan and
// resetLayoutToSeed.
async function seedLayout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  planId: string
): Promise<{ error?: string }> {
  for (const z of buildDefaultLayout()) {
    const { data: zone, error: zErr } = await supabase
      .from("seating_zones")
      .insert({
        plan_id: planId,
        kind: z.kind,
        label: z.label,
        x: z.x,
        y: z.y,
        rotation: z.rotation,
        w: z.w,
        h: z.h,
        capacity: z.capacity,
        position: z.position,
      })
      .select("id")
      .single();
    if (zErr || !zone) return { error: zErr?.message ?? "Failed to seed the layout" };
    if (z.seats.length > 0) {
      const { error: sErr } = await supabase.from("seating_seats").insert(
        z.seats.map((s) => ({
          plan_id: planId,
          zone_id: zone.id as string,
          label: s.label,
          x: s.x,
          y: s.y,
          unavailable: s.unavailable,
        }))
      );
      if (sErr) return { error: sErr.message };
    }
  }
  return {};
}

export async function createPlan(title: string): Promise<{ id?: string; error?: string }> {
  try {
    const { supabase, user } = await requireSeating();
    const name = title.trim() || "Untitled plan";
    const { data: plan, error } = await supabase
      .from("seating_plans")
      .insert({ user_id: user.id, title: name })
      .select("id")
      .single();
    if (error || !plan) return { error: error?.message ?? "Failed to create plan" };
    const planId = plan.id as string;

    const seeded = await seedLayout(supabase, planId);
    if (seeded.error) return seeded;

    void logToolActivity("seating_plan_created", { plan_id: planId, title: name });
    revalidatePath("/tools/seating");
    return { id: planId };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// Throw away the plan's layout (zones + seats — people stay; their seat
// assignments clear via the seat FK) and re-seed the default lounge. Lets an
// existing plan pick up seed improvements without recreating it.
export async function resetLayoutToSeed(planId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    // Zones cascade their seats; loose seats (no zone) need their own delete.
    const { error: zErr } = await supabase.from("seating_zones").delete().eq("plan_id", planId);
    if (zErr) return { error: zErr.message };
    const { error: sErr } = await supabase.from("seating_seats").delete().eq("plan_id", planId);
    if (sErr) return { error: sErr.message };

    const seeded = await seedLayout(supabase, planId);
    if (seeded.error) return seeded;

    void logToolActivity("seating_layout_reset", { plan_id: planId });
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function renamePlan(planId: string, title: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_plans")
      .update({ title: title.trim() || "Untitled plan", updated_at: new Date().toISOString() })
      .eq("id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deletePlan(planId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase.from("seating_plans").delete().eq("id", planId);
    if (error) return { error: error.message };
    void logToolActivity("seating_plan_deleted", { plan_id: planId });
    revalidatePath("/tools/seating");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// Link (or unlink, eventId null) an event to the plan. Linking also turns on
// the event's "who do you want to sit by" signup question.
export async function linkEvent(planId: string, eventId: string | null): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_plans")
      .update({ event_id: eventId, updated_at: new Date().toISOString() })
      .eq("id", planId);
    if (error) return { error: error.message };
    if (eventId) {
      // User client — the coach-shaped events RLS covers this.
      const { error: evErr } = await supabase
        .from("events")
        .update({ collect_sit_by: true })
        .eq("id", eventId);
      if (evErr) return { error: evErr.message };
      void logToolActivity("seating_event_linked", { plan_id: planId, event_id: eventId });
    }
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setCollectSitBy(eventId: string, on: boolean): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase.from("events").update({ collect_sit_by: on }).eq("id", eventId);
    if (error) return { error: error.message };
    revalidatePath("/tools/seating");
    // Event-scoped, so the plan id isn't known — refresh every plan page.
    revalidatePath("/tools/seating/[id]", "page");
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ── People ────────────────────────────────────────────────────────────────────

type ParentLite = { id: string; first_name: string | null; last_name: string | null };
type RosterPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  player_parents: { parents: ParentLite | null }[] | null;
};

type ExistingPerson = {
  id: string;
  kind: string;
  player_id: string | null;
  parent_id: string | null;
  display_name: string;
};

const fullName = (first: string | null, last: string | null) =>
  [first ?? "", last ?? ""].join(" ").replace(/\s+/g, " ").trim();
const nameKey = (n: string) => n.trim().toLowerCase();

async function loadExistingPeople(supabase: Supabase, planId: string): Promise<ExistingPerson[]> {
  const { data } = await supabase
    .from("seating_people")
    .select("id, kind, player_id, parent_id, display_name")
    .eq("plan_id", planId);
  return (data ?? []) as ExistingPerson[];
}

export async function addPeopleFromTeams(
  planId: string,
  input: { teamIds: string[]; playerIds: string[]; includeParents: boolean; includeSiblings: boolean }
): Promise<{ added?: number; error?: string }> {
  try {
    const { supabase } = await requireSeating();

    // Duplicate tolerance: skip anyone already in the plan — by player_id, by
    // (parent_id, kind=parent), or by lower(name) for siblings/guests. The
    // partial unique indexes backstop races.
    const existing = await loadExistingPeople(supabase, planId);
    const havePlayer = new Set(existing.filter((p) => p.player_id).map((p) => p.player_id as string));
    const haveParent = new Set(
      existing.filter((p) => p.kind === "parent" && p.parent_id).map((p) => p.parent_id as string)
    );
    const haveSiblingName = new Set(
      existing.filter((p) => p.kind === "sibling").map((p) => nameKey(p.display_name))
    );

    // Players: whole-team rosters (active only) + explicitly picked players.
    const playersById = new Map<string, { player: RosterPlayer; teamId: string | null }>();
    if (input.teamIds.length > 0) {
      const { data: roster, error } = await supabase
        .from("roster")
        .select(
          `player_id, status, team_id,
           players(id, first_name, last_name, player_parents(parents(id, first_name, last_name)))`
        )
        .in("team_id", input.teamIds);
      if (error) return { error: error.message };
      for (const r of roster ?? []) {
        if (r.status !== "active") continue;
        const pl = r.players as unknown as RosterPlayer | null;
        if (!pl || playersById.has(pl.id)) continue;
        playersById.set(pl.id, { player: pl, teamId: (r.team_id as string) ?? null });
      }
    }
    if (input.playerIds.length > 0) {
      const { data: picked, error } = await supabase
        .from("players")
        .select("id, first_name, last_name, player_parents(parents(id, first_name, last_name))")
        .in("id", input.playerIds);
      if (error) return { error: error.message };
      for (const pl of (picked ?? []) as unknown as RosterPlayer[]) {
        if (!playersById.has(pl.id)) playersById.set(pl.id, { player: pl, teamId: null });
      }
    }

    // Every row carries the SAME keys: PostgREST bulk inserts pad keys missing
    // from some rows with NULL (not the column default), which trips the
    // in_sro NOT NULL constraint on mixed player/parent batches.
    type NewPerson = {
      plan_id: string;
      kind: string;
      display_name: string;
      player_id: string | null;
      parent_id: string | null;
      source_team_id: string | null;
      in_sro: boolean;
    };
    const rows: NewPerson[] = [];

    // Kid rows + the distinct parents across all of them.
    const parentsById = new Map<string, ParentLite>();
    for (const { player, teamId } of playersById.values()) {
      for (const pp of player.player_parents ?? []) {
        if (pp.parents) parentsById.set(pp.parents.id, pp.parents);
      }
      if (havePlayer.has(player.id)) continue;
      havePlayer.add(player.id);
      rows.push({
        plan_id: planId,
        kind: "player",
        display_name: fullName(player.first_name, player.last_name) || "Player",
        player_id: player.id,
        parent_id: null,
        source_team_id: teamId,
        in_sro: false, // kids queue for seats
      });
    }

    if (input.includeParents) {
      for (const p of parentsById.values()) {
        if (haveParent.has(p.id)) continue;
        haveParent.add(p.id);
        rows.push({
          plan_id: planId,
          kind: "parent",
          display_name: fullName(p.first_name, p.last_name) || "Parent",
          player_id: null,
          parent_id: p.id,
          source_team_id: null,
          in_sro: true, // parents default to standing room
        });
      }
    }

    if (input.includeSiblings && parentsById.size > 0) {
      const allParentIds = [...parentsById.keys()];
      const { data: sibRows } = await supabase.from("siblings").select("*").in("parent_id", allParentIds);
      const raw = (sibRows ?? []) as { name: string; attributes: Record<string, unknown> | null; player_id: string | null; parent_id: string }[];
      // One guardian per sibling name, for the family link on the person row.
      const guardianByName = new Map<string, string>();
      for (const s of raw) {
        if (!guardianByName.has(nameKey(s.name))) guardianByName.set(nameKey(s.name), s.parent_id);
      }
      const sibs = dedupeSiblings(
        raw.map((s) => ({
          name: s.name,
          attributes: (s.attributes ?? {}) as Record<string, string | number | boolean>,
          player_id: s.player_id,
        }))
      );
      for (const sib of sibs) {
        const key = nameKey(sib.name);
        if (!key || haveSiblingName.has(key)) continue;
        // A sibling who IS one of the featured players shouldn't be listed twice.
        if (sib.player_id && havePlayer.has(sib.player_id)) continue;
        haveSiblingName.add(key);
        rows.push({
          plan_id: planId,
          kind: "sibling",
          display_name: sib.name,
          parent_id: guardianByName.get(key) ?? null,
          player_id: sib.player_id ?? null,
          source_team_id: null,
          in_sro: false, // siblings are kids — they queue for seats too
        });
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("seating_people").insert(rows);
      if (error) return { error: error.message };
    }

    void logToolActivity("seating_people_added", { plan_id: planId, added: rows.length, source: "teams" });
    revalidatePlan(planId);
    return { added: rows.length };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function addGuest(
  planId: string,
  name: string,
  kind: "guest" | "parent" | "sibling"
): Promise<{ id?: string; error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const display = name.trim();
    if (!display) return { error: "Enter a name." };
    const { data, error } = await supabase
      .from("seating_people")
      .insert({
        plan_id: planId,
        kind,
        display_name: display,
        in_sro: kind === "parent", // adults default to standing room
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "23505") return { error: "That name is already in this plan." };
      return { error: error?.message ?? "Failed to add" };
    }
    revalidatePlan(planId);
    return { id: data.id as string };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function removePerson(planId: string, personId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_people")
      .delete()
      .eq("id", personId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setManualStatus(
  planId: string,
  personId: string,
  status: "planning" | "invited" | "opened" | "no" | "yes" | null
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_people")
      .update({ manual_status: status })
      .eq("id", personId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setLocked(planId: string, personId: string, locked: boolean): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_people")
      .update({ locked })
      .eq("id", personId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ── Seat assignment ───────────────────────────────────────────────────────────

export async function assignSeat(
  planId: string,
  personId: string,
  seatId: string | null
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    if (seatId) {
      const { data: seat } = await supabase
        .from("seating_seats")
        .select("id, unavailable")
        .eq("id", seatId)
        .eq("plan_id", planId)
        .maybeSingle();
      if (!seat) return { error: "That seat isn't in this plan." };
      if (seat.unavailable) return { error: "That seat is unavailable." };
      const { data: occupant } = await supabase
        .from("seating_people")
        .select("id")
        .eq("seat_id", seatId)
        .neq("id", personId)
        .maybeSingle();
      if (occupant) return { error: "That seat is already taken." };
    }
    const { error } = await supabase
      .from("seating_people")
      .update(seatId ? { seat_id: seatId, in_sro: false } : { seat_id: null })
      .eq("id", personId)
      .eq("plan_id", planId);
    if (error) {
      // The one-person-per-seat unique index backstops the occupancy check.
      if (error.code === "23505") return { error: "That seat is already taken." };
      return { error: error.message };
    }
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function setInSro(planId: string, personId: string, inSro: boolean): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_people")
      .update(inSro ? { in_sro: true, seat_id: null } : { in_sro: false })
      .eq("id", personId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function swapSeats(
  planId: string,
  personAId: string,
  personBId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { data: pair } = await supabase
      .from("seating_people")
      .select("id, seat_id")
      .eq("plan_id", planId)
      .in("id", [personAId, personBId]);
    const a = (pair ?? []).find((p) => p.id === personAId);
    const b = (pair ?? []).find((p) => p.id === personBId);
    if (!a || !b) return { error: "Person not found in this plan." };
    const aSeat = (a.seat_id as string | null) ?? null;
    const bSeat = (b.seat_id as string | null) ?? null;

    // Honor the one-person-per-seat unique index: vacate A first, then move B
    // into A's old seat, then A into B's old seat.
    const upd = async (personId: string, seatId: string | null) => {
      const { error } = await supabase
        .from("seating_people")
        .update(seatId ? { seat_id: seatId, in_sro: false } : { seat_id: null })
        .eq("id", personId)
        .eq("plan_id", planId);
      return error;
    };
    let err = await upd(personAId, null);
    if (!err) err = await upd(personBId, aSeat);
    if (!err) err = await upd(personAId, bSeat);
    if (err) return { error: err.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// Commit an auto-assign result: clear the affected (unlocked) people, then set
// each assignment. Locked people are never moved, and no target may collide
// with a seat someone outside this batch is holding.
export async function applyAssignments(
  planId: string,
  rows: { personId: string; seatId: string | null; inSro: boolean }[]
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { data: people } = await supabase
      .from("seating_people")
      .select("id, locked, seat_id")
      .eq("plan_id", planId);
    const personById = new Map((people ?? []).map((p) => [p.id as string, p]));

    const apply = rows.filter((r) => {
      const p = personById.get(r.personId);
      return !!p && !p.locked;
    });
    if (apply.length === 0) return {};

    // Validate target seats: in-plan, available, no duplicates, and not held by
    // anyone we're not moving.
    const { data: seats } = await supabase
      .from("seating_seats")
      .select("id, unavailable")
      .eq("plan_id", planId);
    const seatById = new Map((seats ?? []).map((s) => [s.id as string, s]));
    const targets = apply.map((r) => r.seatId).filter((s): s is string => !!s);
    if (new Set(targets).size !== targets.length) {
      return { error: "Two people were assigned the same seat." };
    }
    for (const t of targets) {
      const seat = seatById.get(t);
      if (!seat) return { error: "An assigned seat isn't in this plan." };
      if (seat.unavailable) return { error: "An assigned seat is unavailable." };
    }
    const movingIds = new Set(apply.map((r) => r.personId));
    const heldByOthers = new Set(
      (people ?? []).filter((p) => !movingIds.has(p.id as string) && p.seat_id).map((p) => p.seat_id as string)
    );
    for (const t of targets) {
      if (heldByOthers.has(t)) return { error: "An assigned seat is already taken by a locked person." };
    }

    // Clear everyone affected first (frees seats for the reshuffle), then set.
    const { error: clearErr } = await supabase
      .from("seating_people")
      .update({ seat_id: null })
      .eq("plan_id", planId)
      .in("id", [...movingIds]);
    if (clearErr) return { error: clearErr.message };
    for (const r of apply) {
      const { error } = await supabase
        .from("seating_people")
        .update({ seat_id: r.seatId, in_sro: r.inSro })
        .eq("id", r.personId)
        .eq("plan_id", planId);
      if (error) return { error: error.message };
    }

    void logToolActivity("seating_auto_assigned", {
      plan_id: planId,
      seated: targets.length,
      sro: apply.filter((r) => r.inSro).length,
    });
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// Unseat everyone who isn't locked (in_sro flags stay as they are).
export async function clearUnlockedAssignments(planId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_people")
      .update({ seat_id: null })
      .eq("plan_id", planId)
      .eq("locked", false)
      .not("seat_id", "is", null);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ── Layout editing ────────────────────────────────────────────────────────────

export async function moveZone(
  planId: string,
  zoneId: string,
  patch: { x?: number; y?: number; rotation?: number; label?: string; w?: number; h?: number; capacity?: number | null }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const update: Record<string, unknown> = {};
    if (patch.x !== undefined) update.x = Math.round(patch.x);
    if (patch.y !== undefined) update.y = Math.round(patch.y);
    if (patch.rotation !== undefined) update.rotation = Math.round(patch.rotation);
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.w !== undefined) update.w = Math.round(patch.w);
    if (patch.h !== undefined) update.h = Math.round(patch.h);
    if (patch.capacity !== undefined) update.capacity = patch.capacity;
    if (Object.keys(update).length === 0) return {};
    const { error } = await supabase
      .from("seating_zones")
      .update(update)
      .eq("id", zoneId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function addZone(
  planId: string,
  input: {
    kind: "cluster" | "sro" | "table" | "bar";
    label: string;
    x: number;
    y: number;
    rotation?: number;
    shape?: ClusterShape;
    capacity?: number | null;
  }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();

    // Stable ordering: next position after this plan's zones of the same kind
    // (clusters count from 1; sro/table/bar bases mirror the seeded layout).
    const { data: maxRow } = await supabase
      .from("seating_zones")
      .select("position")
      .eq("plan_id", planId)
      .eq("kind", input.kind)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const base =
      input.kind === "sro" ? 99 : input.kind === "table" ? 199 : input.kind === "bar" ? 299 : 0;
    const position = ((maxRow?.position as number | undefined) ?? base) + 1;

    const shape: ClusterShape = input.shape ?? "2x4";
    const grid = input.kind === "cluster" ? clusterSeats(shape) : null;
    let w: number;
    let h: number;
    if (grid) {
      w = grid.w;
      h = grid.h;
    } else if (input.kind === "table") {
      w = 140;
      h = 140;
    } else if (input.kind === "bar") {
      w = 420;
      h = 110;
    } else {
      w = 600;
      h = 400;
    }

    const { data: zone, error } = await supabase
      .from("seating_zones")
      .insert({
        plan_id: planId,
        kind: input.kind,
        label: input.label,
        x: Math.round(input.x),
        y: Math.round(input.y),
        rotation: Math.round(input.rotation ?? 0),
        w,
        h,
        capacity: input.capacity ?? null,
        position,
      })
      .select("id")
      .single();
    if (error || !zone) return { error: error?.message ?? "Failed to add zone" };

    if (grid) {
      // Seed the shape's seats (same local-coords math as the seeded layout).
      const seats = grid.seats.map((s) => ({
        plan_id: planId,
        zone_id: zone.id as string,
        label: s.label,
        x: s.x,
        y: s.y,
        unavailable: false,
      }));
      const { error: sErr } = await supabase.from("seating_seats").insert(seats);
      if (sErr) return { error: sErr.message };
    }

    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteZone(planId: string, zoneId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    // Seats cascade; people seated there get seat_id nulled by the seat FK.
    const { error } = await supabase
      .from("seating_zones")
      .delete()
      .eq("id", zoneId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function addSeat(
  planId: string,
  zoneId: string | null,
  x: number,
  y: number,
  label: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    if (zoneId) {
      const { data: zone } = await supabase
        .from("seating_zones")
        .select("id")
        .eq("id", zoneId)
        .eq("plan_id", planId)
        .maybeSingle();
      if (!zone) return { error: "That zone isn't in this plan." };
    }
    const { error } = await supabase.from("seating_seats").insert({
      plan_id: planId,
      zone_id: zoneId,
      x: Math.round(x),
      y: Math.round(y),
      label,
    });
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function updateSeat(
  planId: string,
  seatId: string,
  patch: { x?: number; y?: number; label?: string; unavailable?: boolean }
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const update: Record<string, unknown> = {};
    if (patch.x !== undefined) update.x = Math.round(patch.x);
    if (patch.y !== undefined) update.y = Math.round(patch.y);
    if (patch.label !== undefined) update.label = patch.label;
    if (patch.unavailable !== undefined) update.unavailable = patch.unavailable;
    if (Object.keys(update).length === 0) return {};
    const { error } = await supabase
      .from("seating_seats")
      .update(update)
      .eq("id", seatId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function deleteSeat(planId: string, seatId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_seats")
      .delete()
      .eq("id", seatId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ── Sit-by picks (admin-entered) ──────────────────────────────────────────────

export async function addAdminPick(
  planId: string,
  fromPersonId: string,
  toPersonId: string
): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    if (fromPersonId === toPersonId) return { error: "Pick two different people." };
    const { error } = await supabase.from("seating_picks").insert({
      plan_id: planId,
      from_person_id: fromPersonId,
      to_person_id: toPersonId,
    });
    if (error) {
      if (error.code === "23505") return { error: "That pick already exists." };
      return { error: error.message };
    }
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

export async function removeAdminPick(planId: string, pickId: string): Promise<{ error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { error } = await supabase
      .from("seating_picks")
      .delete()
      .eq("id", pickId)
      .eq("plan_id", planId);
    if (error) return { error: error.message };
    revalidatePlan(planId);
    return {};
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// ── Event integration ─────────────────────────────────────────────────────────

// One RSVP'd attendee as stored in event_signups.attendees. player_id is
// optional (newer signups stamp it for player-tier attendees); older rows fall
// back to name matching.
type RsvpAttendee = {
  tier_id?: string;
  is_player?: boolean;
  name?: string | null;
  status?: string;
  player_id?: string | null;
  attributes?: Record<string, unknown> | null;
};

// Pull the linked event's RSVP'd attendees into the plan's people list:
// player-tier attendees become (or match) player people, parent/sibling tiers
// become parent/sibling people on the signup's family, everything else a guest.
export async function syncPeopleFromEvent(planId: string): Promise<{ added?: number; error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { data: plan } = await supabase
      .from("seating_plans")
      .select("id, event_id")
      .eq("id", planId)
      .maybeSingle();
    if (!plan) return { error: "Plan not found." };
    const eventId = plan.event_id as string | null;
    if (!eventId) return { error: "Link an event to this plan first." };

    const [{ data: signups }, { data: tiers }, existing] = await Promise.all([
      supabase
        .from("event_signups")
        .select("id, parent_id, name, attendees, declined, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: true }),
      supabase.from("event_price_tiers").select("id, is_player, is_sibling, is_parent").eq("event_id", eventId),
      loadExistingPeople(supabase, planId),
    ]);
    const tierById = new Map(
      (tiers ?? []).map((t) => [t.id as string, { isPlayer: !!t.is_player, isSibling: !!t.is_sibling, isParent: !!t.is_parent }])
    );

    const havePlayer = new Set(existing.filter((p) => p.player_id).map((p) => p.player_id as string));
    const haveParent = new Set(
      existing.filter((p) => p.kind === "parent" && p.parent_id).map((p) => p.parent_id as string)
    );
    const nameSets: Record<string, Set<string>> = { sibling: new Set(), guest: new Set(), parent: new Set() };
    for (const p of existing) {
      if (nameSets[p.kind]) nameSets[p.kind].add(nameKey(p.display_name));
    }
    const playerPersonNames = new Set(
      existing.filter((p) => p.kind === "player").map((p) => nameKey(p.display_name))
    );

    // Every row carries the SAME keys — PostgREST bulk inserts pad keys missing
    // from some rows with NULL (not the column default), which trips the
    // in_sro NOT NULL constraint on mixed batches.
    type NewPerson = {
      plan_id: string;
      kind: string;
      display_name: string;
      player_id: string | null;
      parent_id: string | null;
      in_sro: boolean;
    };
    const rows: NewPerson[] = [];

    for (const s of signups ?? []) {
      if (s.declined) continue;
      const familyParentId = (s.parent_id as string | null) ?? null;
      const signupName = ((s.name as string) ?? "").trim();
      for (const a of ((s.attendees as RsvpAttendee[] | null) ?? [])) {
        if (a.status === "declined") continue;
        const tier = a.tier_id ? tierById.get(a.tier_id) : undefined;
        const isPlayer = tier?.isPlayer ?? !!a.is_player;
        const isSibling = tier?.isSibling ?? false;
        const isParent = tier?.isParent ?? false;
        const aName = (a.name ?? "").trim();
        const aPlayerId =
          (a.player_id as string | null) ??
          ((a.attributes?.player_id as string | undefined) || null);

        if (isPlayer) {
          // Already in the plan? Matched by player_id, else by name.
          if (aPlayerId && havePlayer.has(aPlayerId)) continue;
          if (!aPlayerId && aName && playerPersonNames.has(nameKey(aName))) continue;
          // Only insert kids we can tie to a real player record; unmatched ones
          // surface via unmatchedRsvpCount instead.
          if (!aPlayerId) continue;
          havePlayer.add(aPlayerId);
          if (aName) playerPersonNames.add(nameKey(aName));
          rows.push({
            plan_id: planId,
            kind: "player",
            display_name: aName || signupName || "Player",
            player_id: aPlayerId,
            parent_id: familyParentId,
            in_sro: false,
          });
        } else if (isParent) {
          const display = aName || signupName;
          if (!display) continue;
          if (nameSets.parent.has(nameKey(display))) continue;
          // The family link can only be used once per plan (unique index); a
          // second parent attendee from the same signup stays name-only.
          const linkParent = familyParentId && !haveParent.has(familyParentId) ? familyParentId : null;
          if (linkParent) haveParent.add(linkParent);
          nameSets.parent.add(nameKey(display));
          rows.push({
            plan_id: planId,
            kind: "parent",
            display_name: display,
            player_id: null,
            parent_id: linkParent,
            in_sro: true,
          });
        } else if (isSibling) {
          if (!aName) continue;
          if (nameSets.sibling.has(nameKey(aName))) continue;
          nameSets.sibling.add(nameKey(aName));
          rows.push({
            plan_id: planId,
            kind: "sibling",
            display_name: aName,
            player_id: null,
            parent_id: familyParentId,
            in_sro: false,
          });
        } else {
          const display = aName || signupName;
          if (!display) continue;
          if (nameSets.guest.has(nameKey(display))) continue;
          nameSets.guest.add(nameKey(display));
          rows.push({
            plan_id: planId,
            kind: "guest",
            display_name: display,
            player_id: null,
            parent_id: familyParentId,
            in_sro: false,
          });
        }
      }
    }

    if (rows.length > 0) {
      const { error } = await supabase.from("seating_people").insert(rows);
      if (error) return { error: error.message };
    }

    void logToolActivity("seating_people_added", { plan_id: planId, added: rows.length, source: "event" });
    revalidatePlan(planId);
    return { added: rows.length };
  } catch (e) {
    return { error: errMsg(e) };
  }
}

// Email the linked event's signup link to the families behind the selected
// people (players → their guardians; parents → themselves; siblings/guests →
// their stored guardian). Delegates to the events tool's inviteParents so the
// invite is recorded in the same Invited → Opened → RSVP'd funnel.
export async function invitePeople(
  planId: string,
  personIds: string[]
): Promise<{ sent?: number; error?: string }> {
  try {
    const { supabase } = await requireSeating();
    const { data: plan } = await supabase
      .from("seating_plans")
      .select("id, event_id")
      .eq("id", planId)
      .maybeSingle();
    if (!plan) return { error: "Plan not found." };
    const eventId = plan.event_id as string | null;
    if (!eventId) return { error: "Link an event to this plan first." };

    const ids = [...new Set(personIds)].filter(Boolean);
    if (ids.length === 0) return { error: "Pick at least one person to invite." };

    const { data: persons } = await supabase
      .from("seating_people")
      .select("id, kind, player_id, parent_id")
      .eq("plan_id", planId)
      .in("id", ids);

    const parentIds = new Set<string>();
    const playerIds: string[] = [];
    for (const p of persons ?? []) {
      if (p.parent_id) parentIds.add(p.parent_id as string);
      if (p.kind === "player" && p.player_id) playerIds.push(p.player_id as string);
    }
    if (playerIds.length > 0) {
      const { data: pp } = await supabase
        .from("player_parents")
        .select("parent_id")
        .in("player_id", playerIds);
      for (const r of pp ?? []) if (r.parent_id) parentIds.add(r.parent_id as string);
    }
    if (parentIds.size === 0) {
      return { error: "None of those people have a linked parent to invite." };
    }

    const res = await inviteParents(eventId, [...parentIds]);
    if (res.error) return { error: res.error };

    void logToolActivity("seating_invites_sent", {
      plan_id: planId,
      people: ids.length,
      parents: parentIds.size,
      invited: res.invited,
      emailed: res.sent,
    });
    revalidatePlan(planId);
    return { sent: res.sent };
  } catch (e) {
    return { error: errMsg(e) };
  }
}
