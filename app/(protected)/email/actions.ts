"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addInterestEntry(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const sport      = (formData.get("sport")      as string)?.trim();
  const first_name = (formData.get("first_name") as string)?.trim();
  const last_name  = (formData.get("last_name")  as string)?.trim() ?? "";
  const email      = (formData.get("email")      as string)?.trim() || null;
  const phone      = (formData.get("phone")      as string)?.trim() || null;
  const notes      = (formData.get("notes")      as string)?.trim() || null;

  if (!sport || !first_name) return { error: "Sport and first name are required" };

  const { error } = await supabase.from("interest_lists").insert({
    user_id: user.id, sport, first_name, last_name, email, phone, notes,
  });

  if (error) return { error: error.message };
  revalidatePath("/email");
  return { error: null };
}

export async function deleteInterestEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("interest_lists").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/email");
  return { error: null };
}
