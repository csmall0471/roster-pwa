"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { data: rows } = await supabase.rpc("get_my_player_ids");
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
