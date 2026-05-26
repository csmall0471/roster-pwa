"use server"

import { createClient } from "@/lib/supabase/server"

export type ActivityEvent =
  | "login"
  | "training_signup"
  | "training_cancel"
  | "snack_signup"
  | "snack_cancel"

export async function logActivity(
  parentId: string,
  event: ActivityEvent,
  metadata?: Record<string, unknown>,
) {
  try {
    const supabase = await createClient()
    await supabase.from("user_activity").insert({ parent_id: parentId, event, metadata })
  } catch {
    // Never let activity logging break the calling action
  }
}

// Resolves parent_id from the current auth session, then logs. Use for login tracking.
export async function logActivityForCurrentUser(
  event: ActivityEvent,
  metadata?: Record<string, unknown>,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: link } = await supabase
      .from("parent_auth")
      .select("parent_id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    if (!link) return
    await supabase.from("user_activity").insert({ parent_id: link.parent_id, event, metadata })
  } catch {
    // Never let activity logging break the calling action
  }
}
