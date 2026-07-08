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
  gender: string | null;
  weight: number | null;
  external_id: string | null;
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
  // Hand-drawn signature placed on the front. Position is stored as fractions of
  // the stage so it scales across screen sizes (same convention as `transform`).
  signature?: {
    url: string;
    x: number;
    y: number;
    scale: number;
    rotation?: number;
    // Vector strokes (points normalized so x=1 = the signature width) kept so
    // the color/thickness can be changed later without redrawing. Absent on
    // signatures drawn before this was added — those can only be redrawn.
    strokes?: { x: number; y: number }[][];
    color?: string;
    thickness?: number;
  } | null;
}

export interface CardBackDesign {
  stats: {
    position: string;
    height: string;
    jersey: string;
    age: string;
    favorite_team: string;
    favorite_player: string;
    signature_move: string;
    favorite_drill: string;
    // Fun "questionnaire" fields — the player's answers, all optional.
    biggest_fan: string;
    loudest_parent: string;
    picks_me_up: string;
  };
  scouting_report: string;
  // A short quote from the player about their season.
  season_quote?: string;
  look_alike: string;
  look_alike_photo?: string | null; // photo of the matched pro player
  look_alike_blurb?: string; // one-line play-style description of the pro
  // Small headshot shown in the upper-right of the back, with object-position
  // (0–100) so it can be panned within its circle.
  headshot_url?: string | null;
  headshot_x?: number | null;
  headshot_y?: number | null;
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
  | "yesno"
  | "date";

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
  // Adjusts the attendee's price when this Yes/No or checkbox field is answered
  // yes/checked (cents; may be negative for a discount). Ignored for other types.
  price_adjust_cents: number;
  // For select fields: cents per option, index-aligned with `options`. Picking
  // an option adds its amount to the attendee's price.
  option_prices: number[];
}

// Pickable values for the standard player/sibling attributes, so these are
// dropdowns (grade, shirt size) / a calendar (birthdate) everywhere they're
// collected — the event signup tiers and the in-app siblings editor.
export const GRADE_OPTIONS = [
  "Pre-K", "K", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th", "10th", "11th", "12th",
];
export const SHIRT_SIZE_OPTIONS = [
  "YXS", "YS", "YM", "YL", "YXL", "AXS", "AS", "AM", "AL", "AXL", "AXXL",
];

// Roster attributes that can be prefilled per kid on the Player tier.
export type PlayerAttributeKey = "grade" | "shirt_size" | "date_of_birth";

export const PLAYER_ATTRIBUTE_CATALOG: {
  key: PlayerAttributeKey;
  label: string;
  field_type: EventFieldType;
  options?: string[];
}[] = [
  { key: "grade", label: "Grade", field_type: "select", options: GRADE_OPTIONS },
  { key: "shirt_size", label: "Shirt size", field_type: "select", options: SHIRT_SIZE_OPTIONS },
  { key: "date_of_birth", label: "Birthdate", field_type: "date" },
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
  is_parent: boolean;
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
  // The parent responded "can't make it" (or marked everyone not-attending):
  // recorded as a signup so the invite resolves, but nobody's attending/charged.
  declined: boolean;
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
