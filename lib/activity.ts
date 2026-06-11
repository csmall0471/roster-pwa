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
  | "card_flipped"
  | "card_deleted"
  // Events / signup pages
  | "event_link_opened"
  | "event_signup"

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

