"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type TeamFormState = {
  error?: string;
} | null;

function parseTeamFields(formData: FormData) {
  return {
    name:         (formData.get("name") as string)?.trim() ?? "",
    sport:        (formData.get("sport") as string)?.trim() ?? "",
    season:       (formData.get("season") as string)?.trim() ?? "",
    age_group:    (formData.get("age_group") as string)?.trim() ?? "",
    organization: (formData.get("organization") as string)?.trim() || null,
    season_start: (formData.get("season_start") as string) || null,
    season_end:   (formData.get("season_end") as string) || null,
    mojo_code:        (formData.get("mojo_code") as string)?.trim() || null,
    snack_signup_url: (formData.get("snack_signup_url") as string)?.trim() || null,
  };
}

export async function createTeam(
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fields = parseTeamFields(formData);
  if (!fields.name) return { error: "Team name is required" };

  const { error } = await supabase.from("teams").insert({ user_id: user.id, ...fields });
  if (error) return { error: error.message };

  revalidatePath("/teams");
  redirect("/teams");
}

export async function updateTeam(
  id: string,
  _prev: TeamFormState,
  formData: FormData
): Promise<TeamFormState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fields = parseTeamFields(formData);
  if (!fields.name) return { error: "Team name is required" };

  const { error } = await supabase
    .from("teams")
    .update(fields)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/teams");
  revalidatePath(`/teams/${id}`);
  redirect(`/teams/${id}`);
}

export async function deleteTeam(id: string): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("teams").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/teams");
  redirect("/teams");
}
