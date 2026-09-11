"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";

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
  photoId,
  storagePath,
  publicUrl,
  backStoragePath,
  backPublicUrl,
  teamName,
  season,
  teamId,
  cardDesign,
}: {
  playerId: string;
  // When set, the card is edited in place (updates this existing row) instead of
  // inserting a new one — so re-editing doesn't leave a duplicate behind.
  photoId?: string;
  storagePath: string;
  publicUrl: string;
  backStoragePath?: string;
  backPublicUrl?: string;
  teamName?: string;
  season?: string;
  teamId?: string;
  cardDesign?: CardDesign;
}): Promise<{ error?: string; photoId?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // The card must be owned by the player's coach (players.user_id), NOT by
  // whoever is creating it — a granted parent's auth.uid() differs from the
  // coach's, and an owner-keyed row is the one both the coach page (filters by
  // user_id) and the parent page (RLS parents_read_photos) can see. We read the
  // owner and write the row with the service client so a parent can attach a
  // card under the coach's user_id (RLS WITH CHECK would otherwise block it).
  const service = createServiceClient();
  const { data: player } = await service
    .from("players")
    .select("user_id")
    .eq("id", playerId)
    .single();
  if (!player) return { error: "Player not found" };
  const ownerId = player.user_id as string;

  // Authorize: the coach themselves, or a parent of this kid who holds the
  // card-creator grant. Anyone else can't assign a card to this player.
  let authorized = user.id === ownerId;
  if (!authorized) {
    const { data: hasTool } = await supabase.rpc("has_tool_access", { tool: "card-creator" });
    if (hasTool) {
      const { data: kidRows } = await supabase.rpc("get_my_player_ids");
      const kidIds = new Set(((kidRows ?? []) as { player_id: string }[]).map((r) => r.player_id));
      authorized = kidIds.has(playerId);
    }
  }
  if (!authorized) return { error: "You don't have access to save a card to this player." };

  // Clear existing primary for this player (scoped to the coach's rows).
  await service
    .from("player_photos")
    .update({ is_primary: false })
    .eq("player_id", playerId)
    .eq("user_id", ownerId);

  const fields = {
    storage_path: storagePath,
    public_url: publicUrl,
    back_storage_path: backStoragePath ?? null,
    back_public_url: backPublicUrl ?? null,
    team_name: teamName ?? null,
    season: season ?? null,
    is_primary: true,
    team_id: teamId ?? null,
    card_design: cardDesign ?? null,
  };

  // Editing an existing card updates that row in place; a fresh card inserts.
  const { data, error } = photoId
    ? await service
        .from("player_photos")
        .update(fields)
        .eq("id", photoId)
        .eq("player_id", playerId)
        .eq("user_id", ownerId)
        .select("id")
        .single()
    : await service
        .from("player_photos")
        .insert({ user_id: ownerId, player_id: playerId, ...fields })
        .select("id")
        .single();

  if (error) return { error: error.message };
  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  revalidatePath(`/parent/player/${playerId}`);
  if (teamId) {
    revalidatePath(`/teams/${teamId}`);
    revalidatePath(`/parent/team/${teamId}`);
  }
  return { photoId: data?.id };
}

// ── Persist a group card to every featured player ─────────────
// A duo/trio card is saved as one row per featured player, all tied together by
// a shared card_group_id, so a later edit or delete reaches every copy. Unlike
// savePlayerPhoto these rows are always is_primary:false — a group card lives in
// the gallery, never as a player's profile/primary card.

export async function saveCardForPlayers(input: {
  playerIds: string[]; // all featured players, unique (primary + linked extras)
  primaryPlayerId: string; // the card's primary player
  primaryPhotoId?: string; // an existing single-card row to fold into the group (solo→group conversion)
  cardGroupId?: string; // reuse when editing an existing group; else a new one is generated
  storagePath: string;
  publicUrl: string;
  backStoragePath?: string;
  backPublicUrl?: string;
  teamName?: string;
  season?: string;
  teamId?: string;
  cardDesign?: CardDesign;
}): Promise<{ error?: string; cardGroupId?: string }> {
  const {
    playerIds,
    primaryPlayerId,
    primaryPhotoId,
    cardGroupId,
    storagePath,
    publicUrl,
    backStoragePath,
    backPublicUrl,
    teamName,
    season,
    teamId,
    cardDesign,
  } = input;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // The card is owned by the coach (players.user_id), not whoever creates it —
  // same reasoning as savePlayerPhoto. Resolve the owner from the primary player
  // and write every row under that owner via the service client.
  const service = createServiceClient();
  const { data: player } = await service
    .from("players")
    .select("user_id")
    .eq("id", primaryPlayerId)
    .single();
  if (!player) return { error: "Player not found" };
  const ownerId = player.user_id as string;

  // Authorize the featured players. The coach owns them all; a granted parent
  // can only save to their own kids, so intersect with get_my_player_ids.
  let authorizedIds: string[];
  if (user.id === ownerId) {
    authorizedIds = [...new Set(playerIds)];
  } else {
    const { data: hasTool } = await supabase.rpc("has_tool_access", { tool: "card-creator" });
    if (!hasTool) return { error: "You don't have access to save a card to these players." };
    const { data: kidRows } = await supabase.rpc("get_my_player_ids");
    const kidIds = new Set(((kidRows ?? []) as { player_id: string }[]).map((r) => r.player_id));
    authorizedIds = [...new Set(playerIds)].filter((pid) => kidIds.has(pid));
  }
  if (!authorizedIds.length) {
    return { error: "You don't have access to save a card to these players." };
  }

  const groupId = cardGroupId ?? crypto.randomUUID();

  // Existing rows already in this group (empty for a brand-new group).
  const { data: groupRows } = await service
    .from("player_photos")
    .select("id, player_id")
    .eq("card_group_id", groupId)
    .eq("user_id", ownerId);
  const rowByPlayer = new Map(
    ((groupRows ?? []) as { id: string; player_id: string }[]).map((r) => [r.player_id, r.id])
  );

  // Shared fields written to every row. is_primary is always false: group cards
  // are gallery-only, never a player's profile/primary card.
  const fields = {
    storage_path: storagePath,
    public_url: publicUrl,
    back_storage_path: backStoragePath ?? null,
    back_public_url: backPublicUrl ?? null,
    team_name: teamName ?? null,
    season: season ?? null,
    is_primary: false,
    team_id: teamId ?? null,
    card_design: cardDesign ?? null,
    card_group_id: groupId,
  };

  // Upsert one row per authorized featured player.
  for (const pid of authorizedIds) {
    let rowId = rowByPlayer.get(pid);
    // On a solo→group conversion the primary's pre-group single row has no
    // card_group_id yet, so it isn't in groupRows — adopt it explicitly.
    if (!rowId && pid === primaryPlayerId && primaryPhotoId) rowId = primaryPhotoId;

    const { error } = rowId
      ? await service
          .from("player_photos")
          .update(fields)
          .eq("id", rowId)
          .eq("user_id", ownerId)
      : await service
          .from("player_photos")
          .insert({ user_id: ownerId, player_id: pid, ...fields });
    if (error) return { error: error.message };
  }

  // Players removed from the card on this edit: drop their now-stale rows. Keyed
  // off the FEATURED set (not just the authorized ones) so a co-player the caller
  // can't write to is never silently deleted. Storage is shared, so leave files.
  const featuredSet = new Set(playerIds);
  for (const [pid, rowId] of rowByPlayer) {
    if (!featuredSet.has(pid)) {
      await service.from("player_photos").delete().eq("id", rowId).eq("user_id", ownerId);
    }
  }

  for (const pid of authorizedIds) {
    revalidatePath(`/players/${pid}`);
    revalidatePath(`/parent/player/${pid}`);
  }
  revalidatePath("/players");
  if (teamId) {
    revalidatePath(`/teams/${teamId}`);
    revalidatePath(`/parent/team/${teamId}`);
  }
  return { cardGroupId: groupId };
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

// ── Bulk assign photos to a team ────────────────────────────

export async function bulkAssignPhotosToTeam(
  photoIds: string[],
  teamId: string | null
): Promise<{ error?: string }> {
  if (!photoIds.length) return {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  let teamName: string | null = null;
  let season: string | null = null;

  if (teamId) {
    const { data: team } = await supabase
      .from("teams")
      .select("name, season")
      .eq("id", teamId)
      .single();
    teamName = team?.name ?? null;
    season = team?.season ?? null;
  }

  const { error } = await supabase
    .from("player_photos")
    .update({ team_id: teamId, team_name: teamName, season })
    .in("id", photoIds)
    .eq("user_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/players/cards");
  revalidatePath("/players");
  if (teamId) revalidatePath(`/teams/${teamId}`);
  return {};
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
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  // Pull team_id (+ group/back path) before deletion so we can revalidate the
  // right team page and know whether this is one copy of a group card.
  const { data: photoRow } = await supabase
    .from("player_photos")
    .select("team_id, is_primary, card_group_id, back_storage_path")
    .eq("id", photoId)
    .maybeSingle();

  // Best-effort storage cleanup — bucket policy is user-prefix-based, so cross-
  // owner deletes silently no-op. The DB row removal below is what hides the
  // card from the UI; orphan files can be swept later. The image files are
  // shared across a group's rows, so a single remove covers the whole group.
  const toRemove = [storagePath];
  if (photoRow?.back_storage_path) toRemove.push(photoRow.back_storage_path);
  await supabase.storage.from("player-photos").remove(toRemove);

  if (photoRow?.card_group_id) {
    // Group card: deleting any copy removes every per-player row in the group.
    const { error: delErr } = await supabase
      .from("player_photos")
      .delete()
      .eq("card_group_id", photoRow.card_group_id);
    if (delErr) return { error: delErr.message };

    revalidatePath(`/players/${playerId}`);
    revalidatePath(`/parent/player/${playerId}`);
    revalidatePath("/players");
    if (photoRow.team_id) {
      revalidatePath(`/teams/${photoRow.team_id}`);
      revalidatePath(`/parent/team/${photoRow.team_id}`);
    }
    return {};
  }

  // RLS gates this: owner / parent of kid / team owner can delete.
  const { error: delErr } = await supabase
    .from("player_photos")
    .delete()
    .eq("id", photoId);
  if (delErr) return { error: delErr.message };

  // If we deleted the primary, promote the most recent remaining card.
  if (photoRow?.is_primary) {
    const { data: remaining } = await supabase
      .from("player_photos")
      .select("id")
      .eq("player_id", playerId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (remaining) {
      await supabase
        .from("player_photos")
        .update({ is_primary: true })
        .eq("id", remaining.id);
    }
  }

  revalidatePath(`/players/${playerId}`);
  revalidatePath("/players");
  revalidatePath(`/parent/player/${playerId}`);
  if (photoRow?.team_id) {
    revalidatePath(`/teams/${photoRow.team_id}`);
    revalidatePath(`/parent/team/${photoRow.team_id}`);
  }
  return {};
}
