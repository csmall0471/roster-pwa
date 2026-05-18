"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"

export type PaymentMethod = { label: string; link: string | null }

export type SessionData = {
  title:             string
  description:       string | null
  location:          string | null
  session_date:      string
  session_time:      string | null
  session_end_time:  string | null
  max_players:       number
  payment_amount:    string | null
  payment_methods:   PaymentMethod[]
  eligibility_rules: EligibilityRules
  notes:             string | null
  series_id:         string | null
}

function addWeeks(dateStr: string, weeks: number): string {
  const d = new Date(dateStr + "T00:00:00")
  d.setDate(d.getDate() + weeks * 7)
  return d.toISOString().split("T")[0]
}

export async function createTrainingSession(data: SessionData, repeatWeeks = 1) {
  const supabase = await createClient()
  // Recurring batches always get a fresh series_id; single sessions use whatever was passed
  const seriesId = repeatWeeks > 1 ? crypto.randomUUID() : data.series_id
  const rows = Array.from({ length: repeatWeeks }, (_, i) => ({
    ...data,
    series_id:    seriesId,
    session_date: i === 0 ? data.session_date : addWeeks(data.session_date, i),
  }))
  const { data: inserted, error } = await supabase
    .from("training_sessions")
    .insert(rows)
    .select("id, session_date")
  if (error) return { ids: [] as string[], seriesId: null, error: error.message }
  revalidatePath("/training")
  return { ids: (inserted ?? []).map((r) => r.id as string), seriesId, error: null }
}

export async function updateTrainingSession(id: string, data: SessionData) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").update(data).eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function deleteTrainingSession(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_sessions").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function signUpForTraining(
  sessionId:     string,
  playerId:      string,
  paymentMethod: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { signupId: null, error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) return { signupId: null, error: "Not a parent account" }

  const { data: session } = await supabase
    .from("training_sessions")
    .select("id, max_players")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }

  const { count } = await supabase
    .from("training_signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
  if ((count ?? 0) >= session.max_players) return { signupId: null, error: "Session is full" }

  const { data: row, error } = await supabase
    .from("training_signups")
    .insert({
      session_id:     sessionId,
      player_id:      playerId,
      parent_id:      parentLink.parent_id,
      payment_method: paymentMethod,
    })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  revalidatePath("/parent/training")
  return { signupId: row.id as string, error: null }
}

export async function bulkSignUpForTraining(
  sessionIds:    string[],
  playerId:      string,
  paymentMethod: string | null,
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { results: [], error: "Not authenticated" }

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!parentLink) return { results: [], error: "Not a parent account" }

  const results: Array<{ sessionId: string; signupId: string }> = []

  for (const sessionId of sessionIds) {
    const { data: session } = await supabase
      .from("training_sessions")
      .select("max_players")
      .eq("id", sessionId)
      .single()
    if (!session) continue

    const { count } = await supabase
      .from("training_signups")
      .select("*", { count: "exact", head: true })
      .eq("session_id", sessionId)
    if ((count ?? 0) >= session.max_players) continue

    const { data: row, error } = await supabase
      .from("training_signups")
      .insert({
        session_id:     sessionId,
        player_id:      playerId,
        parent_id:      parentLink.parent_id,
        payment_method: paymentMethod,
      })
      .select("id")
      .single()
    if (!error && row) results.push({ sessionId, signupId: row.id as string })
  }

  revalidatePath("/parent/training")
  return { results, error: null }
}

export async function adminAddTrainingSignup(sessionId: string, playerId: string) {
  const supabase = await createClient()

  const { data: session } = await supabase
    .from("training_sessions")
    .select("max_players")
    .eq("id", sessionId)
    .single()
  if (!session) return { signupId: null, error: "Session not found" }

  const { count } = await supabase
    .from("training_signups")
    .select("*", { count: "exact", head: true })
    .eq("session_id", sessionId)
  if ((count ?? 0) >= session.max_players) return { signupId: null, error: "Session is full" }

  const { data: parentRow } = await supabase
    .from("player_parents")
    .select("parent_id")
    .eq("player_id", playerId)
    .limit(1)
    .maybeSingle()

  const { data: row, error } = await supabase
    .from("training_signups")
    .insert({ session_id: sessionId, player_id: playerId, parent_id: parentRow?.parent_id ?? null })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  revalidatePath("/training")
  return { signupId: row.id as string, error: null }
}

export async function adminRemoveTrainingSignup(signupId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function markTrainingSignupPaid(signupId: string, paid: boolean) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").update({ paid }).eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/training")
  return { error: null }
}

export async function cancelTrainingSignup(signupId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/parent/training")
  return { error: null }
}
