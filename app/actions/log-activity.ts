"use server"

import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity"
import type { ActivityEvent } from "@/lib/activity"

export async function logClientActivity(
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
    if (link?.parent_id) {
      await logActivity(link.parent_id, event, metadata)
    }
  } catch {
    // Never let activity logging break the UI
  }
}
