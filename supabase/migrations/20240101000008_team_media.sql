-- Team media: team photo + season gallery (photos & videos).
-- Requires a "team-media" storage bucket created in the Supabase dashboard.

CREATE TABLE team_media (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id      uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  media_type   text NOT NULL CHECK (media_type IN ('photo', 'video')),
  is_team_photo boolean NOT NULL DEFAULT false,
  caption      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_media: owner full access" ON team_media
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Parents can read media for teams their kids are on
CREATE POLICY "parents_read_team_media" ON team_media
  FOR SELECT USING (
    team_id IN (
      SELECT r.team_id FROM roster r
      WHERE r.player_id IN (SELECT player_id FROM get_my_player_ids())
    )
  );

CREATE INDEX idx_team_media_team_id ON team_media(team_id);
CREATE INDEX idx_team_media_user_id  ON team_media(user_id);
