"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { QuestionAnswerType, QuestionSetStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

// Coach = authenticated user with no parent_auth row. Re-checked server-side on
// every action since actions are reachable via direct POST. RLS ("owner full
// access" on user_id) is the real gate; this just fails fast with a clean error.
async function requireCoach(supabase: SupabaseClient): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (parentLink) return null; // parents are not coaches
  return user.id;
}

const ANSWER_TYPES: QuestionAnswerType[] = ["text", "number", "select", "bool"];

// ── Question sets ─────────────────────────────────────────────────────────────

export async function createSet(input: {
  title: string;
  description: string;
  team_ids: string[];
}): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const title = input.title.trim();
  if (!title) return { error: "Give the list a title." };

  const { data: set, error } = await supabase
    .from("question_sets")
    .insert({
      user_id: userId,
      title,
      description: input.description.trim() || null,
    })
    .select("id")
    .single();
  if (error || !set) return { error: error?.message ?? "Could not create the list." };

  const teamIds = [...new Set(input.team_ids)].filter(Boolean);
  if (teamIds.length > 0) {
    const { error: teamErr } = await supabase
      .from("question_set_teams")
      .insert(teamIds.map((team_id) => ({ set_id: set.id, team_id, user_id: userId })));
    if (teamErr) return { error: teamErr.message };
  }

  revalidatePath("/questions");
  return { id: set.id };
}

export async function updateSet(
  setId: string,
  patch: { title?: string; description?: string; status?: QuestionSetStatus }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) return { error: "Title can't be empty." };
    update.title = t;
  }
  if (patch.description !== undefined) update.description = patch.description.trim() || null;
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) return {};

  const { error } = await supabase
    .from("question_sets")
    .update(update)
    .eq("id", setId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/questions");
  revalidatePath(`/questions/${setId}`);
  return {};
}

export async function deleteSet(setId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const { error } = await supabase
    .from("question_sets")
    .delete()
    .eq("id", setId)
    .eq("user_id", userId);
  if (error) return { error: error.message };

  revalidatePath("/questions");
  return {};
}

// Replace the set's targeted teams with exactly `team_ids`.
export async function setSetTeams(
  setId: string,
  teamIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const wanted = [...new Set(teamIds)].filter(Boolean);

  // Diff against existing so we don't churn rows (and answers stay put).
  const { data: existing } = await supabase
    .from("question_set_teams")
    .select("team_id")
    .eq("set_id", setId);
  const have = new Set((existing ?? []).map((r) => r.team_id as string));

  const toAdd = wanted.filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !wanted.includes(id));

  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("question_set_teams")
      .insert(toAdd.map((team_id) => ({ set_id: setId, team_id, user_id: userId })));
    if (error) return { error: error.message };
  }
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("question_set_teams")
      .delete()
      .eq("set_id", setId)
      .in("team_id", toRemove);
    if (error) return { error: error.message };
  }

  revalidatePath(`/questions/${setId}`);
  return {};
}

// ── Questions ─────────────────────────────────────────────────────────────────

export async function addQuestion(
  setId: string,
  input: { prompt: string; help_text: string; answer_type: QuestionAnswerType; options: string[] }
): Promise<{ id?: string; error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const prompt = input.prompt.trim();
  if (!prompt) return { error: "Give the question a prompt." };
  const answer_type = ANSWER_TYPES.includes(input.answer_type) ? input.answer_type : "text";
  const options =
    answer_type === "select"
      ? input.options.map((o) => o.trim()).filter(Boolean)
      : [];
  if (answer_type === "select" && options.length === 0)
    return { error: "Add at least one choice for a dropdown question." };

  // Append after the current last question.
  const { data: last } = await supabase
    .from("questions")
    .select("position")
    .eq("set_id", setId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data: q, error } = await supabase
    .from("questions")
    .insert({ set_id: setId, user_id: userId, prompt, help_text: input.help_text.trim() || null, answer_type, options, position })
    .select("id")
    .single();
  if (error || !q) return { error: error?.message ?? "Could not add the question." };

  revalidatePath(`/questions/${setId}`);
  return { id: q.id };
}

export async function updateQuestion(
  questionId: string,
  patch: { prompt?: string; help_text?: string; answer_type?: QuestionAnswerType; options?: string[] }
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const update: Record<string, unknown> = {};
  if (patch.prompt !== undefined) {
    const p = patch.prompt.trim();
    if (!p) return { error: "Prompt can't be empty." };
    update.prompt = p;
  }
  if (patch.help_text !== undefined) update.help_text = patch.help_text.trim() || null;
  if (patch.answer_type !== undefined) {
    update.answer_type = ANSWER_TYPES.includes(patch.answer_type) ? patch.answer_type : "text";
  }
  if (patch.options !== undefined) {
    update.options = patch.options.map((o) => o.trim()).filter(Boolean);
  }
  if (Object.keys(update).length === 0) return {};

  const { data: q, error } = await supabase
    .from("questions")
    .update(update)
    .eq("id", questionId)
    .eq("user_id", userId)
    .select("set_id")
    .single();
  if (error) return { error: error.message };

  if (q?.set_id) revalidatePath(`/questions/${q.set_id}`);
  return {};
}

export async function deleteQuestion(questionId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const { data: q, error } = await supabase
    .from("questions")
    .delete()
    .eq("id", questionId)
    .eq("user_id", userId)
    .select("set_id")
    .single();
  if (error) return { error: error.message };

  if (q?.set_id) revalidatePath(`/questions/${q.set_id}`);
  return {};
}

// Reorder questions within a set. `orderedIds` is the full list in new order.
export async function reorderQuestions(
  setId: string,
  orderedIds: string[]
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await supabase
      .from("questions")
      .update({ position: i })
      .eq("id", orderedIds[i])
      .eq("user_id", userId);
    if (error) return { error: error.message };
  }
  revalidatePath(`/questions/${setId}`);
  return {};
}

// ── Answers ───────────────────────────────────────────────────────────────────

// Upsert a single cell. An empty value deletes the row so "no row" = still open.
export async function setAnswer(
  questionId: string,
  playerId: string,
  value: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const userId = await requireCoach(supabase);
  if (!userId) return { error: "Not authorized." };

  const trimmed = value.trim();

  if (trimmed === "") {
    const { error } = await supabase
      .from("question_answers")
      .delete()
      .eq("question_id", questionId)
      .eq("player_id", playerId)
      .eq("user_id", userId);
    if (error) return { error: error.message };
    return {};
  }

  const { error } = await supabase.from("question_answers").upsert(
    {
      question_id: questionId,
      player_id: playerId,
      user_id: userId,
      value: trimmed,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "question_id,player_id" }
  );
  if (error) return { error: error.message };
  return {};
}
