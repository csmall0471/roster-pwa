"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"

export type SkillsSession = {
  id:           string
  name:         string
  session_date: string
  notes:        string | null
  created_at:   string
}

export type SkillsAttempt = {
  id:                string
  skills_session_id: string
  player_id:         string
  course_time_ms:    number | null
  free_throw_makes:  number | null
  hot_shots_8pt:     number
  hot_shots_7pt:     number
  hot_shots_5pt:     number
  hot_shots_3pt:     number
  hot_shots_2pt:     number
  notes:             string | null
}

// Sessions

export async function createSkillsSession(data: { name: string; session_date: string; notes: string | null }) {
  const supabase = await createClient()
  const { data: row, error } = await supabase
    .from("skills_sessions")
    .insert(data)
    .select("id, name, session_date, notes, created_at")
    .single()
  if (error) return { session: null, error: error.message }
  revalidatePath("/training/skills")
  return { session: row as SkillsSession, error: null }
}

export async function deleteSkillsSession(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("skills_sessions").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training/skills")
  return { error: null }
}

// Attempts

export async function upsertSkillsAttempt(
  skillsSessionId: string,
  playerId: string,
  data: {
    course_time_ms?:   number | null
    free_throw_makes?: number | null
    hot_shots_8pt?:    number
    hot_shots_7pt?:    number
    hot_shots_5pt?:    number
    hot_shots_3pt?:    number
    hot_shots_2pt?:    number
    notes?:            string | null
  }
) {
  const supabase = await createClient()

  // Check if attempt exists
  const { data: existing } = await supabase
    .from("skills_attempts")
    .select("id")
    .eq("skills_session_id", skillsSessionId)
    .eq("player_id", playerId)
    .maybeSingle()

  let result: { data: any; error: any }

  if (existing) {
    result = await supabase
      .from("skills_attempts")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select()
      .single()
  } else {
    result = await supabase
      .from("skills_attempts")
      .insert({ skills_session_id: skillsSessionId, player_id: playerId, ...data })
      .select()
      .single()
  }

  if (result.error) return { attempt: null, error: result.error.message }
  revalidatePath("/training/skills")
  return { attempt: result.data as SkillsAttempt, error: null }
}

export async function deleteSkillsAttempt(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from("skills_attempts").delete().eq("id", id)
  if (error) return { error: error.message }
  revalidatePath("/training/skills")
  return { error: null }
}
