"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity";

// Set (or replace) a kid's profile photo. The image is uploaded client-side to
// the parent's own storage prefix (allowed by the bucket policy); here we just
// record it as the player's primary photo. The row is written under the coach's
// user_id (via the service client) so both the coach and the parent can see it —
// a parent's auth.uid() would fail the owner-keyed RLS WITH CHECK. Mirrors how
// savePlayerPhoto attaches a card on a parent's behalf.
export async function setPlayerPhoto(
  playerId: string,
  storagePath: string,
  publicUrl: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [{ data: rows }, { data: parentLink }] = await Promise.all([
    supabase.rpc("get_my_player_ids"),
    supabase.from("parent_auth").select("parent_id").eq("auth_user_id", user.id).maybeSingle(),
  ]);
  const myIds = new Set((rows ?? []).map((r: { player_id: string }) => r.player_id));

  const service = createServiceClient();
  const { data: player } = await service.from("players").select("user_id").eq("id", playerId).single();
  if (!player) return { error: "Player not found" };
  const ownerId = player.user_id as string;
  // Authorized: the coach who owns the player, or a guardian of this kid.
  if (user.id !== ownerId && !myIds.has(playerId)) return { error: "Not your player" };

  // Make this the primary photo (scoped to the owner's rows), then insert it.
  await service.from("player_photos").update({ is_primary: false }).eq("player_id", playerId).eq("user_id", ownerId);
  const { error } = await service.from("player_photos").insert({
    user_id: ownerId,
    player_id: playerId,
    storage_path: storagePath,
    public_url: publicUrl,
    is_primary: true,
  });
  if (error) return { error: error.message };

  if (parentLink?.parent_id) logActivity(parentLink.parent_id, "player_photo_updated", { player_id: playerId }).catch(() => {});
  revalidatePath(`/parent/player/${playerId}`);
  revalidatePath("/parent");
  revalidatePath(`/players/${playerId}`);
  return { error: null };
}

export async function updatePlayerInfo(
  playerId: string,
  data: {
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    shirt_size: string | null;
    grade: string | null;
    notes: string | null;
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [{ data: rows }, { data: parentLink }] = await Promise.all([
    supabase.rpc("get_my_player_ids"),
    supabase.from("parent_auth").select("parent_id").eq("auth_user_id", user.id).maybeSingle(),
  ]);
  const myIds = new Set((rows ?? []).map((r: { player_id: string }) => r.player_id));
  if (!myIds.has(playerId)) return { error: "Not your player" };

  const { error } = await supabase
    .from("players")
    .update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      date_of_birth: data.date_of_birth || null,
      shirt_size: data.shirt_size?.trim() || null,
      grade: data.grade?.trim() || null,
      notes: data.notes?.trim() || null,
    })
    .eq("id", playerId);

  if (error) return { error: error.message };
  if (parentLink?.parent_id) logActivity(parentLink.parent_id, "player_info_updated", { player_id: playerId }).catch(() => {});
  revalidatePath(`/parent/player/${playerId}`);
  revalidatePath("/parent");
  return { error: null };
}

export async function updateParentInfo(data: {
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) return { error: "Not a parent" };

  const { error } = await supabase
    .from("parents")
    .update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim() || null,
    })
    .eq("id", parentLink.parent_id);

  if (error) return { error: error.message };
  revalidatePath("/parent", "layout");
  return { error: null };
}

export async function updateAnyParent(
  parentId: string,
  data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  }
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const [{ error }, { data: parentLink }] = await Promise.all([
    supabase.from("parents").update({
      first_name: data.first_name.trim(),
      last_name: data.last_name.trim(),
      email: data.email.trim(),
      phone: data.phone?.trim() || null,
    }).eq("id", parentId),
    supabase.from("parent_auth").select("parent_id").eq("auth_user_id", user.id).maybeSingle(),
  ]);

  if (error) return { error: error.message };
  if (parentLink?.parent_id) logActivity(parentLink.parent_id, "guardian_updated", { updated_parent_id: parentId }).catch(() => {});
  revalidatePath("/parent", "layout");
  return { error: null };
}

export async function addCoparent(
  playerId: string,
  data: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  }
): Promise<{ error: string | null; parentId: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", parentId: null };

  const [{ data: newId, error }, { data: parentLink }] = await Promise.all([
    supabase.rpc("add_coparent", {
      p_player_id:  playerId,
      p_first_name: data.first_name.trim(),
      p_last_name:  data.last_name.trim(),
      p_email:      data.email.trim(),
      p_phone:      data.phone?.trim() || null,
    }),
    supabase.from("parent_auth").select("parent_id").eq("auth_user_id", user.id).maybeSingle(),
  ]);

  if (error) return { error: error.message, parentId: null };
  if (parentLink?.parent_id) logActivity(parentLink.parent_id, "guardian_added", { player_id: playerId }).catch(() => {});
  revalidatePath("/parent", "layout");
  return { error: null, parentId: newId as string };
}
