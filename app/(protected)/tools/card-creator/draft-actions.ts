"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";
import { buildPhotoDraftDesign } from "@/app/_components/cardgen/photo-draft-design";
import { photoDraftPath } from "./bulk/photo-path";
import { loadAssignTargets } from "./load-targets";

export type CardDraftRow = {
  id: string;
  label: string | null;
  team_name: string | null;
  season: string | null;
  front_url: string | null;
  back_url: string | null;
  updated_at: string;
};

// Drafts are a coach-owner feature. RLS already scopes rows to the user, but we
// also gate to coaches so parents/helpers can't create them.
async function requireOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) === 0) throw new Error("Not authorized");
  return { supabase, user };
}

export async function saveCardDraft(input: {
  id?: string;
  label: string;
  teamName: string;
  season: string;
  frontUrl: string;
  backUrl: string;
  cardDesign: CardDesign;
  // Optional: earmark the draft for a specific kid. Stored on the draft only —
  // nothing is written to player_photos, so it stays off the kid's profile.
  playerId?: string;
  teamId?: string;
}): Promise<{ id?: string; error?: string }> {
  const { supabase, user } = await requireOwner();
  const row = {
    user_id: user.id,
    label: input.label || null,
    team_name: input.teamName || null,
    season: input.season || null,
    front_url: input.frontUrl,
    back_url: input.backUrl,
    card_design: input.cardDesign,
    player_id: input.playerId || null,
    team_id: input.teamId || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data: updated, error } = await supabase
      .from("card_drafts")
      .update(row)
      .eq("id", input.id)
      .eq("user_id", user.id)
      .select("id");
    if (error) return { error: error.message };
    // Publishing deletes the draft while the editor stays open on it. Saving
    // again then has to bring the draft back rather than update nothing.
    if ((updated ?? []).length === 0) {
      const { error: insertError } = await supabase
        .from("card_drafts")
        .insert({ ...row, id: input.id });
      if (insertError) return { error: insertError.message };
    }
    revalidatePath("/tools/card-creator");
    return { id: input.id };
  }

  const { data, error } = await supabase
    .from("card_drafts")
    .insert(row)
    .select("id")
    .single();
  if (error) return { error: error.message };
  revalidatePath("/tools/card-creator");
  return { id: data?.id as string };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PHOTO_DRAFTS_PER_CALL = 100;

// Save already-uploaded photos as drafts for their players, with no design work.
// The client picks each draft id and uploads the photo to the matching path
// below, so the photo URL is derived here rather than trusted from the client,
// and a retry after a lost response can't create a second copy. That retry may
// carry a different player if the coach re-picked, so it re-points the row.
export async function createPhotoDrafts(
  items: { id: string; targetKey: string }[]
): Promise<{ results?: { id: string; error?: string }[]; error?: string }> {
  try {
    if (items.length > MAX_PHOTO_DRAFTS_PER_CALL) return { error: "Too many photos at once" };
    const { supabase, user } = await requireOwner();
    const { assignTargets, error: loadError } = await loadAssignTargets(supabase, user.id);
    if (loadError) return { error: loadError };
    const targetByKey = new Map(assignTargets.map((t) => [t.key, t]));

    const errors = new Map<string, string>();
    const rows = [];
    for (const item of items) {
      const target = targetByKey.get(item.targetKey);
      if (!UUID_RE.test(item.id)) {
        errors.set(item.id, "Invalid photo id");
        continue;
      }
      if (!target) {
        errors.set(item.id, "That player is no longer on this team");
        continue;
      }
      const photoUrl = supabase.storage
        .from("player-photos")
        .getPublicUrl(photoDraftPath(user.id, item.id)).data.publicUrl;
      rows.push({
        id: item.id,
        user_id: user.id,
        label: target.name,
        team_name: (target.teamName ?? "").toUpperCase() || null,
        season: target.season,
        front_url: null,
        back_url: null,
        card_design: buildPhotoDraftDesign(target, photoUrl),
        player_id: target.id,
        team_id: target.teamId,
        updated_at: new Date().toISOString(),
      });
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from("card_drafts")
        .upsert(rows, { onConflict: "id", ignoreDuplicates: true });
      if (error) return { error: error.message };

      const { data: existing, error: readError } = await supabase
        .from("card_drafts")
        .select("id, player_id, team_id, front_url")
        .eq("user_id", user.id)
        .in("id", rows.map((r) => r.id));
      if (readError) return { error: readError.message };
      const existingById = new Map((existing ?? []).map((r) => [r.id as string, r]));
      for (const row of rows) {
        const current = existingById.get(row.id);
        if (!current) {
          errors.set(row.id, "This draft couldn't be saved");
        } else if (current.player_id !== row.player_id || current.team_id !== row.team_id) {
          if (current.front_url) {
            errors.set(row.id, "This photo's draft has already been designed");
            continue;
          }
          const { error: repointError } = await supabase
            .from("card_drafts")
            .update(row)
            .eq("id", row.id)
            .eq("user_id", user.id);
          if (repointError) errors.set(row.id, repointError.message);
        }
      }
      revalidatePath("/tools/card-creator");
    }
    return {
      results: items.map((item) => ({ id: item.id, error: errors.get(item.id) })),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

// Store the cutout made the first time a photo-only draft is opened.
export async function attachDraftCutout(
  id: string,
  cutoutUrl: string
): Promise<{ error?: string }> {
  const { supabase, user } = await requireOwner();
  const { data, error: readError } = await supabase
    .from("card_drafts")
    .select("card_design")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!data) return { error: "Draft not found" };
  const { error } = await supabase
    .from("card_drafts")
    .update({ card_design: { ...(data.card_design as CardDesign), cutout_url: cutoutUrl } })
    .eq("id", id)
    .eq("user_id", user.id)
    // Never overwrite a design saved while the background was being removed.
    .eq("card_design->>cutout_url", "");
  if (error) return { error: error.message };
  // Otherwise browser Back restores the cached page and pays for removal again.
  revalidatePath("/tools/card-creator");
  return {};
}

export async function deleteCardDraft(id: string): Promise<{ error?: string }> {
  const { supabase, user } = await requireOwner();
  const { error } = await supabase
    .from("card_drafts")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };
  revalidatePath("/tools/card-creator");
  return {};
}
