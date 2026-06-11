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
