"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// ── Types ─────────────────────────────────────────────────────

export type CardExtraction = {
  first_name: string;
  last_name: string;
  team_name: string;
  season: string;
};

export type CardMatch = {
  extraction: CardExtraction;
  player_id: string | null;
  player_name: string | null;
  confidence: "exact" | "partial" | "none";
};

// ── AI extraction ─────────────────────────────────────────────

export async function extractCardInfo(imageUrl: string): Promise<CardExtraction> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "url", url: imageUrl } },
          {
            type: "text",
            text: `This is a youth sports season photo card. Extract the player name, team name, and season.
The player's first and last name are displayed prominently (usually large text at the bottom).
The team name and season (e.g. "WILDCATS – SPRING 2026") appear in a banner or vertical text.
Respond with ONLY valid JSON, no other text:
{"first_name":"...","last_name":"...","team_name":"...","season":"..."}`,
          },
        ],
      },
    ],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";
  try {
    const m = raw.match(/\{[\s\S]*?\}/);
    return m ? JSON.parse(m[0]) : { first_name: "", last_name: "", team_name: "", season: "" };
  } catch {
    return { first_name: "", last_name: "", team_name: "", season: "" };
  }
}

// ── Match extraction to a player in the DB ────────────────────

export async function matchCardToPlayer(imageUrl: string): Promise<CardMatch> {
  const [extraction, supabase] = await Promise.all([
    extractCardInfo(imageUrl),
    createClient(),
  ]);

  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name");

  const all = players ?? [];
  const first = extraction.first_name.trim().toLowerCase();
  const last = extraction.last_name.trim().toLowerCase();

  // Exact full-name match
  const exact = all.find(
    (p) =>
      p.first_name.toLowerCase() === first &&
      p.last_name.toLowerCase() === last
  );
  if (exact) {
    return {
      extraction,
      player_id: exact.id,
      player_name: `${exact.first_name} ${exact.last_name}`,
      confidence: "exact",
    };
  }

  // Last-name-only match (only confident if unique)
  if (last) {
    const byLast = all.filter((p) => p.last_name.toLowerCase() === last);
    if (byLast.length === 1) {
      return {
        extraction,
        player_id: byLast[0].id,
        player_name: `${byLast[0].first_name} ${byLast[0].last_name}`,
        confidence: "partial",
      };
    }
  }

  return { extraction, player_id: null, player_name: null, confidence: "none" };
}

// ── Persist a confirmed photo ────────────────────────────────

export async function savePlayerPhoto({
  playerId,
  storagePath,
  publicUrl,
  teamName,
  season,
  teamId,
}: {
  playerId: string;
  storagePath: string;
  publicUrl: string;
  teamName?: string;
  season?: string;
  teamId?: string;
}): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Clear existing primary for this player
  await supabase
    .from("player_photos")
    .update({ is_primary: false })
    .eq("player_id", playerId)
    .eq("user_id", user.id);

  const { error } = await supabase.from("player_photos").insert({
    user_id: user.id,
    player_id: playerId,
    storage_path: storagePath,
    public_url: publicUrl,
    team_name: teamName ?? null,
    season: season ?? null,
    is_primary: true,
    team_id: teamId ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  return {};
}

// ── Assign a photo to a team ─────────────────────────────────

export async function assignPhotoToTeam(
  photoId: string,
  teamId: string | null,
  playerId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("player_photos")
    .update({ team_id: teamId })
    .eq("id", photoId)
    .eq("user_id", user.id);

  revalidatePath(`/players/${playerId}`);
  if (teamId) {
    revalidatePath(`/teams/${teamId}`);
  }
}

// ── Set an existing photo as primary ─────────────────────────

export async function setPrimaryPhoto(photoId: string, playerId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("player_photos")
    .update({ is_primary: false })
    .eq("player_id", playerId)
    .eq("user_id", user.id);

  await supabase
    .from("player_photos")
    .update({ is_primary: true })
    .eq("id", photoId)
    .eq("user_id", user.id);

  revalidatePath(`/players/${playerId}`);
}

// ── Delete a photo ───────────────────────────────────────────

export async function deletePlayerPhoto(
  photoId: string,
  storagePath: string,
  playerId: string
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Delete from storage
  await supabase.storage.from("player-photos").remove([storagePath]);

  // Delete record
  await supabase
    .from("player_photos")
    .delete()
    .eq("id", photoId)
    .eq("user_id", user.id);

  // Promote most recent remaining photo to primary
  const { data: remaining } = await supabase
    .from("player_photos")
    .select("id")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (remaining) {
    await supabase
      .from("player_photos")
      .update({ is_primary: true })
      .eq("id", remaining.id);
  }

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
}
