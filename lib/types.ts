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
  storage_path: string;
  public_url: string;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
  created_at: string;
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
