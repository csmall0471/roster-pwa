"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";

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
    const { error } = await supabase
      .from("card_drafts")
      .update(row)
      .eq("id", input.id)
      .eq("user_id", user.id);
    if (error) return { error: error.message };
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
