"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type PlayerFormState = { error?: string } | null;

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function upsertParent(
  supabase: SupabaseClient,
  userId: string,
  existingId: string | null,
  firstName: string,
  lastName: string,
  phone: string,
  email: string
): Promise<string | null> {
  const hasData = firstName.trim() || lastName.trim() || phone.trim() || email.trim();
  if (!hasData) return null;

  if (existingId) {
    await supabase
      .from("parents")
      .update({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: phone.trim() || null,
        email: email.trim(),
      })
      .eq("id", existingId)
      .eq("user_id", userId);
    return existingId;
  }

  const { data } = await supabase
    .from("parents")
    .insert({
      user_id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      phone: phone.trim() || null,
      email: email.trim(),
    })
    .select("id")
    .single();

  return data?.id ?? null;
}

export async function createPlayer(
  _prev: PlayerFormState,
  formData: FormData
): Promise<PlayerFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const firstName = (formData.get("first_name") as string)?.trim();
  if (!firstName) return { error: "First name is required" };

  const { data: player, error: playerErr } = await supabase
    .from("players")
    .insert({
      user_id: user.id,
      first_name: firstName,
      last_name: (formData.get("last_name") as string)?.trim() ?? "",
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      grade: (formData.get("grade") as string)?.trim() || null,
      shirt_size: (formData.get("shirt_size") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .select("id")
    .single();

  if (playerErr) return { error: playerErr.message };

  for (const n of ["1", "2"] as const) {
    const parentId = await upsertParent(
      supabase,
      user.id,
      null,
      (formData.get(`p${n}_first_name`) as string) ?? "",
      (formData.get(`p${n}_last_name`) as string) ?? "",
      (formData.get(`p${n}_phone`) as string) ?? "",
      (formData.get(`p${n}_email`) as string) ?? ""
    );
    if (parentId) {
      await supabase.from("player_parents").insert({
        player_id: player.id,
        parent_id: parentId,
        user_id: user.id,
        relationship: "parent",
      });
    }
  }

  revalidatePath("/players");
  redirect("/players");
}

export async function updatePlayer(
  id: string,
  _prev: PlayerFormState,
  formData: FormData
): Promise<PlayerFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const firstName = (formData.get("first_name") as string)?.trim();
  if (!firstName) return { error: "First name is required" };

  const { error: playerErr } = await supabase
    .from("players")
    .update({
      first_name: firstName,
      last_name: (formData.get("last_name") as string)?.trim() ?? "",
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      grade: (formData.get("grade") as string)?.trim() || null,
      shirt_size: (formData.get("shirt_size") as string)?.trim() || null,
      notes: (formData.get("notes") as string)?.trim() || null,
    })
    .eq("id", id)
    .eq("user_id", user.id);

  if (playerErr) return { error: playerErr.message };

  for (const n of ["1", "2"] as const) {
    const existingId = (formData.get(`p${n}_id`) as string) || null;
    const parentId = await upsertParent(
      supabase,
      user.id,
      existingId,
      (formData.get(`p${n}_first_name`) as string) ?? "",
      (formData.get(`p${n}_last_name`) as string) ?? "",
      (formData.get(`p${n}_phone`) as string) ?? "",
      (formData.get(`p${n}_email`) as string) ?? ""
    );
    // Only create the link for new parents (existing ones already have it)
    if (parentId && !existingId) {
      await supabase.from("player_parents").insert({
        player_id: id,
        parent_id: parentId,
        user_id: user.id,
        relationship: "parent",
      });
    }
  }

  revalidatePath("/players");
  redirect("/players");
}

export async function deletePlayer(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("players").delete().eq("id", id).eq("user_id", user.id);
  revalidatePath("/players");
  redirect("/players");
}

export async function bulkDeletePlayers(
  playerIds: string[]
): Promise<{ error?: string }> {
  if (!playerIds.length) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("players")
    .delete()
    .in("id", playerIds)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath("/players");
  return {};
}

export async function bulkAddToTeam(
  playerIds: string[],
  teamId: string
): Promise<{ error?: string }> {
  if (!playerIds.length || !teamId) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Find players already on this team so we don't insert duplicates
  const { data: existing } = await supabase
    .from("roster")
    .select("player_id")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .in("player_id", playerIds);

  const alreadyOn = new Set((existing ?? []).map((r) => r.player_id));
  const toInsert = playerIds.filter((id) => !alreadyOn.has(id));

  if (toInsert.length) {
    const { error } = await supabase.from("roster").insert(
      toInsert.map((pid) => ({
        user_id: user.id,
        team_id: teamId,
        player_id: pid,
        status: "active",
      }))
    );
    if (error) return { error: error.message };
  }

  revalidatePath("/players");
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function bulkRemoveFromTeam(
  playerIds: string[],
  teamId: string
): Promise<{ error?: string }> {
  if (!playerIds.length || !teamId) return {};
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("roster")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .in("player_id", playerIds);

  if (error) return { error: error.message };
  revalidatePath("/players");
  revalidatePath(`/teams/${teamId}`);
  return {};
}
