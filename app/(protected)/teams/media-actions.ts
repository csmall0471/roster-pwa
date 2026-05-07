"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function saveTeamMedia({
  teamId,
  storagePath,
  publicUrl,
  mediaType,
  isTeamPhoto = false,
  caption,
}: {
  teamId: string;
  storagePath: string;
  publicUrl: string;
  mediaType: "photo" | "video";
  isTeamPhoto?: boolean;
  caption?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  if (isTeamPhoto) {
    await supabase
      .from("team_media")
      .update({ is_team_photo: false })
      .eq("team_id", teamId)
      .eq("user_id", user.id);
  }

  const { error } = await supabase.from("team_media").insert({
    user_id: user.id,
    team_id: teamId,
    storage_path: storagePath,
    public_url: publicUrl,
    media_type: mediaType,
    is_team_photo: isTeamPhoto,
    caption: caption ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function setTeamPhoto(mediaId: string, teamId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await supabase
    .from("team_media")
    .update({ is_team_photo: false })
    .eq("team_id", teamId)
    .eq("user_id", user.id);

  const { error } = await supabase
    .from("team_media")
    .update({ is_team_photo: true })
    .eq("id", mediaId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function updateMediaCaption(
  mediaId: string,
  caption: string,
  teamId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("team_media")
    .update({ caption: caption || null })
    .eq("id", mediaId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}

export async function deleteTeamMedia(
  mediaId: string,
  storagePath: string,
  teamId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  await supabase.storage.from("team-media").remove([storagePath]);

  const { error } = await supabase
    .from("team_media")
    .delete()
    .eq("id", mediaId)
    .eq("user_id", user.id);

  if (error) return { error: error.message };
  revalidatePath(`/teams/${teamId}`);
  return {};
}
