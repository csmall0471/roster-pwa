import "server-only";

import { createServiceClient } from "@/lib/supabase/server";
import type { SavedSibling, SignupAttendee, SignupPlayer } from "@/lib/types";

// Shared "who is this parent + what does their form prefill look like" builder.
// identifyParent (the OTP path in actions.ts) and the coach's preview mode on
// the public page both use it, so a preview is pixel-for-pixel what that family
// would actually see.

type ServiceClient = ReturnType<typeof createServiceClient>;

export type ExistingSignup = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  responses: Record<string, string | number | boolean>;
  attendees: SignupAttendee[];
  declined: boolean;
};

export type IdentifiedParent = {
  parent_id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  players: SignupPlayer[];
  siblings: SavedSibling[];
  // Everyone in the family (the signed-in parent + co-parents who share a kid),
  // so the Parent tier can pre-fill both parents — not just whoever logged in.
  family_parents: { name: string }[];
  // This family's saved "sit by" seating picks for the event, keyed by kid
  // player id. Empty when nothing's picked (or the table doesn't exist yet).
  sit_by_picks: Record<string, string[]>;
  existing_signup: ExistingSignup | null;
};

// Every parent in a player's family: the given parent plus anyone who shares a
// kid with them. Lets BOTH parents of an invited player land on (and edit) the
// same family signup.
export async function familyParentIds(service: ServiceClient, parentId: string): Promise<string[]> {
  const { data: mine } = await service
    .from("player_parents")
    .select("player_id")
    .eq("parent_id", parentId);
  const playerIds = [...new Set((mine ?? []).map((r) => r.player_id as string))];
  if (playerIds.length === 0) return [parentId];
  const { data: co } = await service
    .from("player_parents")
    .select("parent_id")
    .in("player_id", playerIds);
  return [...new Set([parentId, ...((co ?? []).map((r) => r.parent_id as string))])];
}

export async function buildIdentifiedParent(
  service: ServiceClient,
  parentId: string,
  eventId?: string
): Promise<IdentifiedParent | null> {
  const { data: parent } = await service
    .from("parents")
    .select("id, first_name, last_name, email, phone")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent) return null;

  const { data: links } = await service
    .from("player_parents")
    .select("players(id, first_name, last_name, grade, shirt_size, date_of_birth)")
    .eq("parent_id", parentId);

  // Each player_parents row carries its kid under `players`. PostgREST normally
  // returns this embed as a single object, but depending on how it resolves the
  // relationship it can come back as a one-element array — handle both so every
  // linked kid is collected (previously an array shape silently dropped kids).
  type PlayerRow = {
    id: string;
    first_name: string;
    last_name: string;
    grade: string | null;
    shirt_size: string | null;
    date_of_birth: string | null;
  };
  type LinkRow = { players: PlayerRow | PlayerRow[] | null };
  const players: SignupPlayer[] = [];
  const seenPlayerIds = new Set<string>();
  for (const row of (links ?? []) as unknown as LinkRow[]) {
    const embedded = Array.isArray(row.players) ? row.players : row.players ? [row.players] : [];
    for (const p of embedded) {
      if (!p || seenPlayerIds.has(p.id)) continue;
      seenPlayerIds.add(p.id);
      players.push({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        grade: p.grade,
        shirt_size: p.shirt_size,
        date_of_birth: p.date_of_birth,
      });
    }
  }

  // Saved siblings, excluding any that are actually roster players (linked or
  // name-matching) so the same kid isn't offered under both tiers.
  const playerNames = new Set(players.map((p) => p.name.toLowerCase()));
  const { data: sibRows } = await service
    .from("siblings")
    .select("name, attributes, player_id")
    .eq("parent_id", parentId);
  const siblings: SavedSibling[] = [];
  for (const s of (sibRows ?? []) as { name: string; attributes: SavedSibling["attributes"]; player_id: string | null }[]) {
    if (s.player_id) continue;
    if (playerNames.has(s.name.trim().toLowerCase())) continue;
    siblings.push({ name: s.name, attributes: s.attributes ?? {} });
  }

  // The family's saved "who should they sit by" picks for this event, keyed by
  // kid, to prefill the picker. Best-effort: the event_sit_by_picks table ships
  // with a later migration, so any failure just yields no prefill.
  const sit_by_picks: Record<string, string[]> = {};
  if (eventId && players.length) {
    try {
      const { data: pickRows } = await service
        .from("event_sit_by_picks")
        .select("player_id, picked_player_id")
        .eq("event_id", eventId)
        .in("player_id", players.map((p) => p.id));
      for (const r of (pickRows ?? []) as { player_id: string; picked_player_id: string }[]) {
        (sit_by_picks[r.player_id] ??= []).push(r.picked_player_id);
      }
    } catch {
      // Table missing / query failed — the picker simply starts empty.
    }
  }

  // If this parent already RSVP'd to this event, return that row so the form can
  // be re-populated and edited in place instead of creating a duplicate.
  let existing_signup: ExistingSignup | null = null;
  if (eventId) {
    // Match this family's signup (either parent), so co-parents edit one entry.
    const familyIds = await familyParentIds(service, parentId);
    const { data: row } = await service
      .from("event_signups")
      .select("id, name, email, phone, responses, attendees, declined")
      .eq("event_id", eventId)
      .in("parent_id", familyIds)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (row) {
      const rawAttendees = (row.attendees ?? []) as SignupAttendee[];
      existing_signup = {
        id: row.id,
        name: row.name ?? "",
        email: row.email ?? null,
        phone: row.phone ?? null,
        responses: (row.responses ?? {}) as Record<string, string | number | boolean>,
        attendees: rawAttendees.map((a) => ({
          ...a,
          status: a.status === "declined" ? "declined" : "attending",
        })),
        declined: Boolean(row.declined),
      };
    }
  }

  // All parents in the family (signed-in parent first), for the Parent tier.
  const familyIds = await familyParentIds(service, parentId);
  const { data: famRows } = await service
    .from("parents")
    .select("id, first_name, last_name")
    .in("id", familyIds);
  const family_parents = [...(famRows ?? [])]
    .sort((a, b) => (a.id === parentId ? -1 : b.id === parentId ? 1 : 0))
    .map((p) => ({ name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() }))
    .filter((p) => p.name);

  return {
    parent_id: parent.id,
    first_name: parent.first_name ?? "",
    last_name: parent.last_name ?? "",
    email: parent.email ?? null,
    phone: parent.phone ?? null,
    players,
    siblings,
    family_parents,
    sit_by_picks,
    existing_signup,
  };
}
