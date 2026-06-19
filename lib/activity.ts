import { createClient } from "@/lib/supabase/server"

export type ActivityEvent =
  | "login"
  | "training_signup" | "training_cancel"
  | "snack_signup" | "snack_cancel"
  | "player_card_download" | "player_card_download_all" | "photo_card_opened"
  | "past_seasons_expanded" | "past_teams_expanded"
  | "player_info_updated" | "guardian_updated" | "guardian_added"
  | "team_tab_viewed" | "team_photo_viewed"
  | "snack_form_opened"
  | "training_series_expanded" | "training_payment_clicked"
  | "calendar_month_changed"
  // Card generator
  | "card_editor_opened"
  | "card_photo_uploaded"
  | "card_bg_removed"
  | "card_bg_removal_failed"
  | "card_template_picked"
  | "card_bg_image_uploaded"
  | "card_side_switched"
  | "card_scouting_generated"
  | "card_lookalike_generated"
  | "card_saved"
  | "card_save_failed"
  | "card_downloaded"
  | "card_flipped"
  | "card_deleted"
  // Events / signup pages
  | "event_link_opened"
  | "event_signup"
  // Roster Creator tool — attributed to the ACTOR's auth user (owner OR a shared
  // roster admin), not a parent. Lets the owner's activity view show what every
  // user is doing in the tool and when something breaks.
  | "rc_season_created"
  | "rc_season_deleted"
  | "rc_roster_uploaded"
  | "rc_analyze_started"
  | "rc_analyze_completed"
  | "rc_analyze_failed"
  | "rc_teams_generated"
  | "rc_generate_failed"
  | "rc_player_moved"
  | "rc_team_added"
  | "rc_coach_team_added"
  | "rc_assistant_added"
  | "rc_team_deleted"
  | "rc_lock_changed"
  | "rc_csv_exported"
  | "rc_roster_emailed"
  | "rc_access_granted"
  | "rc_access_revoked"
  // Tool permission manager (/access) — granting/revoking tools per user.
  | "tool_access_granted"
  | "tool_access_revoked"
  | "tool_grant_changed"

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

// Log a Roster Creator (or other tool) action by the CURRENT auth user. Works for
// the owner and for shared roster admins (who have no parent record), stashing the
// actor's auth id in metadata so the activity view can attribute it. Swallows all
// errors — telemetry must never break the action it's measuring.
export async function logToolActivity(
  event: ActivityEvent,
  metadata?: Record<string, unknown>,
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from("user_activity").insert({
      parent_id: null,
      event,
      metadata: { ...(metadata ?? {}), actor_user_id: user.id },
    })
  } catch {
    // swallow — never break the caller
  }
}

