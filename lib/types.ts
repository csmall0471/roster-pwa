export interface Team {
  id: string;
  user_id: string;
  name: string;
  season: string;
  sport: string;
  age_group: string;
  organization: string | null;
  season_start: string | null;
  season_end: string | null;
  mojo_code: string | null;
  snack_signup_url: string | null;
  snack_signup_enabled: boolean;
  snack_slots_per_game: number;
  created_at: string;
}

export interface Player {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  grade: string | null;
  shirt_size: string | null;
  notes: string | null;
  created_at: string;
}

export interface PlayerWithParents extends Player {
  player_parents: Array<{
    relationship: string;
    parents: Pick<Parent, "id" | "first_name" | "last_name" | "email" | "phone">;
  }>;
  roster: Array<{
    team_id: string;
    teams: Pick<Team, "id" | "name">;
  }>;
}

export interface Parent {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  created_at: string;
}

export interface PlayerParent {
  player_id: string;
  parent_id: string;
  user_id: string;
  relationship: string;
}

export interface PlayerPhoto {
  id: string;
  user_id: string;
  player_id: string;
  team_id: string | null;
  storage_path: string;
  public_url: string;
  back_storage_path: string | null;
  back_public_url: string | null;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
  card_design: CardDesign | null;
  created_at: string;
}

export interface CardDesign {
  cutout_url: string;
  background:
    | { type: "template"; id: string }
    | { type: "image"; url: string };
  transform: { x: number; y: number; scale: number; rotation?: number };
  text: {
    team_name: string;
    age_group: string | null;
    season: string | null;
    name_line1: string;
    name_line2: string;
    color_scheme: "light" | "dark";
    name_font?: string;
    name_size?: number; // multiplier 0.5–1.5 against the base
    name_italic?: boolean;
  };
  back?: CardBackDesign;
}

export interface CardBackDesign {
  stats: {
    position: string;
    height: string;
    jersey: string;
    hand: string;
    favorite_team: string;
    favorite_player: string;
    signature_move: string;
    age: string;
  };
  scouting_report: string;
  look_alike: string;
}

export interface RosterEntry {
  id: string;
  user_id: string;
  team_id: string;
  player_id: string;
  jersey_number: number | null;
  status: "active" | "inactive";
  created_at: string;
}

// ── Team events (signup pages) ───────────────────────────────────────────────

export type EventStatus = "draft" | "published" | "closed";

export type EventFieldType =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "checkbox"
  | "yesno";

export interface EventRecord {
  id: string;
  team_id: string | null;
  slug: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  image_urls: string[];
  pay_url: string | null;
  pay_instructions: string | null;
  signup_deadline: string | null;
  status: EventStatus;
  created_at: string;
}

export interface EventField {
  id: string;
  event_id: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
  position: number;
}

export interface EventTierField {
  id: string;
  tier_id: string;
  label: string;
  field_type: EventFieldType;
  options: string[];
  required: boolean;
  position: number;
}

// Roster attributes that can be prefilled per kid on the Player tier.
export type PlayerAttributeKey = "grade" | "shirt_size" | "date_of_birth";

export const PLAYER_ATTRIBUTE_CATALOG: {
  key: PlayerAttributeKey;
  label: string;
  field_type: EventFieldType;
}[] = [
  { key: "grade", label: "Grade", field_type: "text" },
  { key: "shirt_size", label: "Shirt size", field_type: "text" },
  { key: "date_of_birth", label: "Birthdate", field_type: "text" },
];

export interface EventPriceTier {
  id: string;
  event_id: string;
  label: string;
  amount_cents: number;
  position: number;
  is_player: boolean;
  collect_attendees: boolean;
  player_attributes: PlayerAttributeKey[];
  is_sibling: boolean;
}

// A saved family sibling, remembered across events.
export interface SavedSibling {
  name: string;
  attributes: Record<string, string | number | boolean>;
}

export interface EventPriceTierWithFields extends EventPriceTier {
  event_tier_fields: EventTierField[];
}

// A player (kid) returned by identifyParent, used to prefill attendees.
export interface SignupPlayer {
  id: string;
  name: string;
  grade: string | null;
  shirt_size: string | null;
  date_of_birth: string | null;
}

// Per-attendee RSVP status. Declined attendees are still recorded (so the coach
// can see who's not coming) but never count toward the total. Defaults to
// "attending" for older rows that predate this field.
export type AttendeeStatus = "attending" | "declined";

// One paid unit on a signup. For attendee-collecting tiers, name + attributes
// are filled; for count-only tiers, name is null (qty = number of entries).
export interface SignupAttendee {
  tier_id: string;
  tier_label: string;
  amount_cents: number;
  is_player: boolean;
  name: string | null;
  attributes: Record<string, string | number | boolean>;
  status?: AttendeeStatus;
}

export interface EventSignup {
  id: string;
  event_id: string;
  parent_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  responses: Record<string, string | number | boolean>;
  attendees: SignupAttendee[];
  total_cents: number;
  paid: boolean;
  paid_at: string | null;
  coach_notes: string | null;
  created_at: string;
}

export interface EventView {
  id: string;
  event_id: string;
  parent_id: string | null;
  visitor_key: string | null;
  created_at: string;
}

// An event with its builder pieces loaded.
export interface EventWithDetails extends EventRecord {
  event_fields: EventField[];
  event_price_tiers: EventPriceTierWithFields[];
}
