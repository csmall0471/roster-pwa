"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type RosterActionState = { error?: string } | null;

export async function addPlayersToTeam(
  _prev: RosterActionState,
  formData: FormData
): Promise<RosterActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const teamId = formData.get("team_id") as string;
  const playerIds = formData.getAll("player_ids") as string[];

  if (!playerIds.length) return { error: "No players selected" };

  const { error } = await supabase.from("roster").insert(
    playerIds.map((pid) => ({
      user_id: user.id,
      team_id: teamId,
      player_id: pid,
      status: "active",
    }))
  );

  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  redirect(`/teams/${teamId}`);
}

export async function removeFromRoster(
  rosterId: string,
  teamId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("roster")
    .delete()
    .eq("id", rosterId)
    .eq("user_id", user.id);

  revalidatePath(`/teams/${teamId}`);
}

export async function updateRosterEntry(
  rosterId: string,
  teamId: string,
  jerseyNumber: number | null,
  status: "active" | "inactive"
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("roster")
    .update({ jersey_number: jerseyNumber, status })
    .eq("id", rosterId)
    .eq("user_id", user.id);

  revalidatePath(`/teams/${teamId}`);
}
