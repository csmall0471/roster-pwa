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

export async function createRosterTagType(
  name: string,
  options: string[]
): Promise<{ error?: string; tagType?: RosterTagType }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const clean = name.trim();
  if (!clean) return { error: "Name is required" };
  const opts = dedupeOptions(options);

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
    .insert({ user_id: user.id, name: clean, options: opts, position })
    .select("id, name, options, position")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/teams");
  return { tagType: data as RosterTagType };
}

export async function updateRosterTagType(
  id: string,
  name: string,
  options: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const clean = name.trim();
  if (!clean) return { error: "Name is required" };

  const { error } = await supabase
    .from("roster_tag_types")
    .update({ name: clean, options: dedupeOptions(options) })
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return { error: error.message };

  revalidatePath("/teams");
  return {};
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

function dedupeOptions(options: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of options) {
    const v = o.trim();
    if (v && !seen.has(v.toLowerCase())) {
      seen.add(v.toLowerCase());
      out.push(v);
    }
  }
  return out;
}
