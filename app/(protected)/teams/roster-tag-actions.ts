"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RosterTagType } from "@/lib/types";

// Set (or clear, when value is "") a tag value on one roster entry. Values live
// on the roster row's `tags` jsonb, keyed by tag-type id, so they're scoped to
// this (team, player). RLS scopes writes to the owning coach.
export async function setRosterTag(
  rosterId: string,
  teamId: string,
  tagTypeId: string,
  value: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: row } = await supabase
    .from("roster")
    .select("tags")
    .eq("id", rosterId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!row) return { error: "Roster entry not found" };

  const tags: Record<string, string> = { ...((row.tags as Record<string, string>) ?? {}) };
  if (value) tags[tagTypeId] = value;
  else delete tags[tagTypeId];

  const { error } = await supabase
    .from("roster")
    .update({ tags })
    .eq("id", rosterId)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath(`/teams/${teamId}`);
  return {};
}

// ── Tag categories (reusable across the coach's teams) ──────────────────────

// One option = its label + a color-palette key ("" = auto color by position).
export type TagOptionInput = { label: string; color: string };

export async function createRosterTagType(
  name: string,
  options: TagOptionInput[]
): Promise<{ error?: string; tagType?: RosterTagType }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const clean = name.trim();
  if (!clean) return { error: "Name is required" };
  const { labels, colors } = splitOptions(options);

  const { data: last } = await supabase
    .from("roster_tag_types")
    .select("position")
    .eq("user_id", user.id)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await supabase
    .from("roster_tag_types")
    .insert({ user_id: user.id, name: clean, options: labels, option_colors: colors, position })
    .select("id, name, options, option_colors, position")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/teams");
  return { tagType: data as RosterTagType };
}

export async function updateRosterTagType(
  id: string,
  name: string,
  options: TagOptionInput[]
): Promise<{ error?: string; tagType?: RosterTagType }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const clean = name.trim();
  if (!clean) return { error: "Name is required" };
  const { labels, colors } = splitOptions(options);

  const { data, error } = await supabase
    .from("roster_tag_types")
    .update({ name: clean, options: labels, option_colors: colors })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, options, option_colors, position")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/teams");
  return { tagType: data as RosterTagType };
}

// Removing a category leaves its values as orphaned keys in roster.tags; they're
// ignored on render (only current tag types are shown).
export async function deleteRosterTagType(id: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase
    .from("roster_tag_types")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/teams");
  return {};
}

// Split option {label,color} pairs into index-aligned arrays, dropping blanks
// and duplicate labels (case-insensitive) while keeping colors aligned.
function splitOptions(options: TagOptionInput[]): { labels: string[]; colors: string[] } {
  const seen = new Set<string>();
  const labels: string[] = [];
  const colors: string[] = [];
  for (const o of options ?? []) {
    const label = (o.label ?? "").trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    labels.push(label);
    colors.push((o.color ?? "").trim());
  }
  return { labels, colors };
}
