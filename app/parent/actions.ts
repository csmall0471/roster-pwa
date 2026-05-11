"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function savePlayerDob(playerId: string, dob: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_player_dob", {
    p_player_id: playerId,
    p_dob: dob,
  });
  if (error) return { error: error.message };
  revalidatePath("/parent");
  return { error: null };
}
