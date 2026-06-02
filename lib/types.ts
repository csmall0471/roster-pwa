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
  transform: { x: number; y: number; scale: number };
  text: {
    team_name: string;
    age_group: string | null;
    season: string | null;
    name_line1: string;
    name_line2: string;
    color_scheme: "light" | "dark";
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
