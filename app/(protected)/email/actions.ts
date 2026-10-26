"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { InterestEntry, InterestList } from "./page";

const revalidate = () => {
  revalidatePath("/email");
  revalidatePath("/players"); // the directory's bulk bar lists the same lists
};

// ── Lists ─────────────────────────────────────────────────────────

export async function createInterestList(
  name: string,
  sport?: string | null
): Promise<{ error?: string; list?: InterestList }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const trimmed = name.trim();
  if (!trimmed) return { error: "List name is required" };

  const { data, error } = await supabase
    .from("interest_list_groups")
    .insert({ user_id: user.id, name: trimmed, sport: sport?.trim() || null })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to create list" };
  revalidate();
  return { list: data as InterestList };
}

export async function renameInterestList(id: string, name: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const trimmed = name.trim();
  if (!trimmed) return { error: "List name is required" };
  const { error } = await supabase
    .from("interest_list_groups")
    .update({ name: trimmed })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// Deletes the list AND its entries (FK cascade).
export async function deleteInterestList(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("interest_list_groups").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return {};
}

// ── Entries ───────────────────────────────────────────────────────

export async function addInterestEntry(
  formData: FormData
): Promise<{ error?: string; entry?: InterestEntry }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const list_id    = (formData.get("list_id")    as string)?.trim() || null;
  const first_name = (formData.get("first_name") as string)?.trim();
  const last_name  = (formData.get("last_name")  as string)?.trim() ?? "";
  const email      = (formData.get("email")      as string)?.trim() || null;
  const phone      = (formData.get("phone")      as string)?.trim() || null;
  const notes      = (formData.get("notes")      as string)?.trim() || null;

  if (!first_name) return { error: "First name is required" };
  if (!list_id) return { error: "Pick a list first" };

  // sport is legacy (pre-067 rows grouped by it); keep it satisfied either way.
  const { data: listRow } = await supabase
    .from("interest_list_groups")
    .select("sport")
    .eq("id", list_id)
    .maybeSingle();

  const { data, error } = await supabase
    .from("interest_lists")
    .insert({
      user_id: user.id,
      list_id,
      player_id: null,
      sport: (listRow?.sport as string | null) ?? "",
      first_name,
      last_name,
      email,
      phone,
      notes,
    })
    .select("*")
    .single();
  if (error || !data) return { error: error?.message ?? "Failed to add" };
  revalidate();
  return { entry: data as InterestEntry };
}

// Bulk-link roster players to a list. Already-listed players are skipped, so
// re-adding a selection is safe. Rows carry the player's name for display;
// contact info is resolved from their parents at compose time.
export async function addPlayersToInterestList(
  listId: string,
  playerIds: string[]
): Promise<{ error?: string; entries?: InterestEntry[]; skipped?: number }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (ids.length === 0) return { entries: [], skipped: 0 };

  const [{ data: existingRows }, { data: playerRows, error: pErr }, { data: listRow }] =
    await Promise.all([
      supabase.from("interest_lists").select("player_id").eq("list_id", listId).not("player_id", "is", null),
      supabase.from("players").select("id, first_name, last_name").in("id", ids),
      supabase.from("interest_list_groups").select("id, sport").eq("id", listId).maybeSingle(),
    ]);
  if (pErr) return { error: pErr.message };
  if (!listRow) return { error: "List not found" };

  const already = new Set((existingRows ?? []).map((r) => r.player_id as string));
  const toAdd = (playerRows ?? []).filter((p) => !already.has(p.id as string));
  if (toAdd.length === 0) return { entries: [], skipped: ids.length };

  // PostgREST pads missing keys in bulk inserts with NULL — every row carries
  // the full identical key set.
  const rows = toAdd.map((p) => ({
    user_id: user.id,
    list_id: listId,
    player_id: p.id as string,
    sport: (listRow.sport as string | null) ?? "",
    first_name: (p.first_name as string) ?? "",
    last_name: (p.last_name as string) ?? "",
    email: null,
    phone: null,
    notes: null,
  }));
  const { data, error } = await supabase.from("interest_lists").insert(rows).select("*");
  if (error) return { error: error.message };
  revalidate();
  return { entries: (data ?? []) as InterestEntry[], skipped: ids.length - toAdd.length };
}

export async function deleteInterestEntry(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("interest_lists").delete().eq("id", id);
  if (error) return { error: error.message };
  revalidate();
  return { error: null };
}
