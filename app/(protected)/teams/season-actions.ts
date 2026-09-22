"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Replace the ordered player list for one award on a team. playerIds[0] = winner,
// the rest are runner-ups in order. Deletes the award's existing rows for this
// (user, team, award) and inserts the new ordered set. Owner-scoped.
export async function setAwardPlayers(input: {
  teamId: string;
  awardKey: string;
  playerIds: string[];
}): Promise<{ error?: string }> {
  const { teamId, awardKey, playerIds } = input;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error: deleteError } = await supabase
    .from("team_awards")
    .delete()
    .eq("user_id", user.id)
    .eq("team_id", teamId)
    .eq("award_key", awardKey);
  if (deleteError) return { error: deleteError.message };

  if (playerIds.length > 0) {
    const { error: insertError } = await supabase.from("team_awards").insert(
      playerIds.map((pid, i) => ({
        user_id: user.id,
        team_id: teamId,
        award_key: awardKey,
        player_id: pid,
        position: i,
      }))
    );
    if (insertError) return { error: insertError.message };
  }

  revalidatePath(`/teams/${teamId}`);
  return {};
}

// Upsert the end-of-season note for one kid on a team.
export async function saveSeasonNote(input: {
  teamId: string;
  playerId: string;
  note: string;
}): Promise<{ error?: string }> {
  const { teamId, playerId, note } = input;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.from("team_season_notes").upsert(
    {
      user_id: user.id,
      team_id: teamId,
      player_id: playerId,
      note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,team_id,player_id" }
  );
  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return {};
}
