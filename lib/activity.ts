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

