"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export type SiblingItem = {
  name: string;
  attributes: Record<string, string | number | boolean>;
  player_id?: string | null;
};

// Authorize the caller for a player and return that player's parent ids.
// Allowed: the coach who owns the player, or any of the player's guardians.
// Siblings are family-level, so writes fan out to every guardian's parent_id.
async function authorizeForPlayer(
  playerId: string
): Promise<{ ok: boolean; parentIds: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, parentIds: [] };

  const service = createServiceClient();
  const { data: pp } = await service
    .from("player_parents")
    .select("parent_id")
    .eq("player_id", playerId);
  const parentIds = [...new Set((pp ?? []).map((r) => r.parent_id as string))];

  const { data: link } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!link) {
    // Coach: must own the player record.
    const { data: player } = await service
      .from("players")
      .select("user_id")
      .eq("id", playerId)
      .maybeSingle();
    if (player && player.user_id === user.id) return { ok: true, parentIds };
    return { ok: false, parentIds: [] };
  }

  // Parent: must be a guardian of the player.
  if (parentIds.includes(link.parent_id)) return { ok: true, parentIds };
  return { ok: false, parentIds: [] };
}

function revalidate(playerId: string) {
  revalidatePath(`/players/${playerId}`);
  revalidatePath(`/parent/player/${playerId}`);
}

const eq = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// Split "First Last" — everything before the last token is the first name.
function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: full.trim(), lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts[parts.length - 1] };
}

export async function addSibling(
  playerId: string,
  name: string,
  attributes: SiblingItem["attributes"]
): Promise<{ error?: string }> {
  const { ok, parentIds } = await authorizeForPlayer(playerId);
  if (!ok) return { error: "Not authorized" };
  const clean = name.trim();
  if (!clean) return { error: "Name is required" };

  const service = createServiceClient();
  const { data: existing } = await service
    .from("siblings")
    .select("parent_id, name")
    .in("parent_id", parentIds);
  const have = new Set(
    (existing ?? []).map((r) => `${r.parent_id}::${(r.name as string).trim().toLowerCase()}`)
  );

  const rows = parentIds
    .filter((pid) => !have.has(`${pid}::${clean.toLowerCase()}`))
    .map((pid) => ({ parent_id: pid, name: clean, attributes }));
  if (rows.length) {
    const { error } = await service.from("siblings").insert(rows);
    if (error) return { error: error.message };
  }
  revalidate(playerId);
  return {};
}

export async function updateSibling(
  playerId: string,
  originalName: string,
  name: string,
  attributes: SiblingItem["attributes"]
): Promise<{ error?: string }> {
  const { ok, parentIds } = await authorizeForPlayer(playerId);
  if (!ok) return { error: "Not authorized" };
  const clean = name.trim();
  if (!clean) return { error: "Name is required" };

  const service = createServiceClient();
  const { data: rows } = await service
    .from("siblings")
    .select("id, parent_id, name")
    .in("parent_id", parentIds);

  const updatedParents = new Set<string>();
  for (const r of rows ?? []) {
    if (!eq(r.name as string, originalName)) continue;
    const { error } = await service
      .from("siblings")
      .update({ name: clean, attributes, updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) return { error: error.message };
    updatedParents.add(r.parent_id as string);
  }
  // Keep co-parents in sync: insert for any guardian that lacked the row.
  const inserts = parentIds
    .filter((pid) => !updatedParents.has(pid))
    .map((pid) => ({ parent_id: pid, name: clean, attributes }));
  if (inserts.length) {
    const { error } = await service.from("siblings").insert(inserts);
    if (error) return { error: error.message };
  }
  revalidate(playerId);
  return {};
}

// Link an existing roster player as a sibling (e.g. two kids in the same family
// who are both players). Stored with player_id set, so they show on the player
// page but are excluded from the Sibling tier at signup (they're a player).
export async function linkPlayerSibling(
  playerId: string,
  siblingPlayerId: string
): Promise<{ error?: string }> {
  if (playerId === siblingPlayerId) return { error: "A player can't be their own sibling." };
  const { ok, parentIds } = await authorizeForPlayer(playerId);
  if (!ok) return { error: "Not authorized" };

  const service = createServiceClient();
  // Look up both players' names; we create a row for each perspective so the
  // link is symmetric (shows on both kids' pages, excluding themselves).
  const { data: pl } = await service
    .from("players")
    .select("id, first_name, last_name")
    .in("id", [playerId, siblingPlayerId]);
  const nameOf = new Map(
    (pl ?? []).map((p) => [p.id as string, `${p.first_name} ${p.last_name}`.trim()])
  );
  if (!nameOf.has(siblingPlayerId) || !nameOf.has(playerId)) {
    return { error: "Player not found." };
  }

  // Both perspectives, for every shared guardian:
  //  - player_id = siblingPlayerId  -> shows the sibling on THIS player's page
  //  - player_id = playerId         -> shows THIS player on the sibling's page
  const want = parentIds.flatMap((pid) => [
    { parent_id: pid, player_id: siblingPlayerId, name: nameOf.get(siblingPlayerId)!, attributes: {} },
    { parent_id: pid, player_id: playerId, name: nameOf.get(playerId)!, attributes: {} },
  ]);

  const { data: existing } = await service
    .from("siblings")
    .select("parent_id, player_id")
    .in("parent_id", parentIds);
  const have = new Set(
    (existing ?? [])
      .filter((r) => r.player_id)
      .map((r) => `${r.parent_id as string}::${r.player_id as string}`)
  );
  const rows = want.filter((r) => !have.has(`${r.parent_id}::${r.player_id}`));
  if (rows.length) {
    const { error } = await service.from("siblings").insert(rows);
    if (error) return { error: error.message };
  }
  revalidate(playerId);
  revalidate(siblingPlayerId);
  return {};
}

// Create a real roster player from a free-text sibling: mirror createPlayer
// (player row + parent links), map the remembered attributes onto the player,
// then convert the sibling into a symmetric linked-player sibling (via
// linkPlayerSibling) so it stops showing as free text. Coach-only — parents
// can't own player records. Returns the new player's id.
export async function promoteSiblingToPlayer(
  playerId: string,
  siblingName: string
): Promise<{ error?: string; newPlayerId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authorized" };

  // Auth via RLS: only the coach who owns this player can read it (and thus
  // create players under their account).
  const { data: player } = await supabase
    .from("players")
    .select("last_name")
    .eq("id", playerId)
    .maybeSingle();
  if (!player) return { error: "Only the team's coach can promote a sibling." };

  const { data: pp } = await supabase
    .from("player_parents")
    .select("parent_id")
    .eq("player_id", playerId);
  const parentIds = [...new Set((pp ?? []).map((r) => r.parent_id as string))];
  if (!parentIds.length) return { error: "This player has no linked parents." };

  // Find the free-text sibling (player_id null) by name; grab its attributes.
  const service = createServiceClient();
  const { data: sibRows } = await service
    .from("siblings")
    .select("id, name, attributes, player_id")
    .in("parent_id", parentIds);
  const matches = (sibRows ?? []).filter((r) => !r.player_id && eq(r.name as string, siblingName));
  if (!matches.length) return { error: "Sibling not found." };

  const attrs = (matches[0].attributes ?? {}) as Record<string, string | number | boolean>;
  const str = (v: unknown) => (v !== undefined && v !== null && v !== "" ? String(v) : null);
  const dobRaw = str(attrs["Birthdate"]);
  const dob = dobRaw && /^\d{4}-\d{2}-\d{2}$/.test(dobRaw) ? dobRaw : null;
  const { firstName, lastName } = splitName(matches[0].name as string);

  const { data: newPlayer, error: insErr } = await supabase
    .from("players")
    .insert({
      user_id: user.id,
      first_name: firstName,
      last_name: lastName || (player.last_name as string) || "",
      date_of_birth: dob,
      grade: str(attrs["Grade"]),
      shirt_size: str(attrs["Shirt size"]),
    })
    .select("id")
    .single();
  if (insErr || !newPlayer) return { error: insErr?.message ?? "Couldn't create the player." };
  const newId = newPlayer.id as string;

  // Link the new player to the same family (both guardians).
  const { error: ppErr } = await supabase.from("player_parents").insert(
    parentIds.map((pid) => ({
      player_id: newId,
      parent_id: pid,
      user_id: user.id,
      relationship: "parent",
    }))
  );
  if (ppErr) return { error: ppErr.message };

  // Drop the old free-text sibling rows, then create the symmetric player link
  // so the two kids show as siblings of each other.
  await service.from("siblings").delete().in(
    "id",
    matches.map((r) => r.id)
  );
  await linkPlayerSibling(playerId, newId);

  revalidatePath("/players");
  revalidate(playerId);
  revalidate(newId);
  return { newPlayerId: newId };
}

export async function deleteSibling(
  playerId: string,
  name: string
): Promise<{ error?: string }> {
  const { ok, parentIds } = await authorizeForPlayer(playerId);
  if (!ok) return { error: "Not authorized" };

  const service = createServiceClient();
  const { data: rows } = await service
    .from("siblings")
    .select("id, name, parent_id")
    .in("parent_id", parentIds);
  const ids = (rows ?? []).filter((r) => eq(r.name as string, name)).map((r) => r.id as string);
  if (ids.length) {
    const { error } = await service.from("siblings").delete().in("id", ids);
    if (error) return { error: error.message };
  }
  revalidate(playerId);
  return {};
}
