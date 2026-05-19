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

export type CourseSplit = {
  checkpoint: string
  time_ms:    number
  order:      number
}

export type ShotLogEntry = {
  position: "8pt" | "7pt" | "5pt" | "3pt" | "2pt"
  made:     boolean
  time_ms:  number
  order:    number
}

export type SkillsAttempt = {
  id:                string
  skills_session_id: string
  player_id:         string
  course_time_ms:    number | null
  course_splits:     CourseSplit[] | null
  free_throw_makes:  number | null
  hot_shots_8pt:     number
  hot_shots_7pt:     number
  hot_shots_5pt:     number
  hot_shots_3pt:     number
  hot_shots_2pt:     number
  hot_shots_log:     ShotLogEntry[] | null
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
    course_splits?:    CourseSplit[] | null
    free_throw_makes?: number | null
    hot_shots_8pt?:    number
    hot_shots_7pt?:    number
    hot_shots_5pt?:    number
    hot_shots_3pt?:    number
    hot_shots_2pt?:    number
    hot_shots_log?:    ShotLogEntry[] | null
    notes?:            string | null
  }
) {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("skills_attempts")
    .select("id")
    .eq("skills_session_id", skillsSessionId)
    .eq("player_id", playerId)
    .maybeSingle()

  const selectCols = "id, skills_session_id, player_id, course_time_ms, course_splits, free_throw_makes, hot_shots_8pt, hot_shots_7pt, hot_shots_5pt, hot_shots_3pt, hot_shots_2pt, hot_shots_log, notes"

  let result: { data: any; error: any }
  if (existing) {
    result = await supabase
      .from("skills_attempts")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select(selectCols)
      .single()
  } else {
    result = await supabase
      .from("skills_attempts")
      .insert({ skills_session_id: skillsSessionId, player_id: playerId, ...data })
      .select(selectCols)
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
