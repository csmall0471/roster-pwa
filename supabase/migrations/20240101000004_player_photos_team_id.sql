ALTER TABLE player_photos ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_player_photos_team_id ON player_photos(team_id);
