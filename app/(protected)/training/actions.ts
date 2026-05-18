"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { EligibilityRules } from "@/lib/training-eligibility"

export type SessionData = {
  title:             string
  description:       string | null
  location:          string | null
  session_date:      string
  session_time:      string | null
  max_players:       number
  payment_link:      string | null
  payment_amount:    string | null
  eligibility_rules: EligibilityRules
  notes:             string | null
}

export async function createTrainingSession(data: SessionData) {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("training_sessions")
    .insert(data)
    .select("id")
    .single()
  if (error) return { id: null, error: error.message }
  revalidatePath("/training")
  return { id: row.id as string, error: null }
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

export async function signUpForTraining(sessionId: string, playerId: string) {
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
    .insert({ session_id: sessionId, player_id: playerId, parent_id: parentLink.parent_id })
    .select("id")
    .single()
  if (error) return { signupId: null, error: error.message }

  revalidatePath("/parent/training")
  return { signupId: row.id as string, error: null }
}

export async function cancelTrainingSignup(signupId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("training_signups").delete().eq("id", signupId)
  if (error) return { error: error.message }
  revalidatePath("/parent/training")
  return { error: null }
}
