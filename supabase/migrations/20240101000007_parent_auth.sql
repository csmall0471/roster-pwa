-- Table linking Supabase auth accounts to parent records
CREATE TABLE IF NOT EXISTS parent_auth (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES parents(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(auth_user_id)
);

ALTER TABLE parent_auth ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parent_auth_own" ON parent_auth
  FOR ALL USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Allow authenticated users to find their own parent record by email
CREATE POLICY "parents_find_by_email" ON parents
  FOR SELECT USING (email = auth.email());

-- Allow authenticated users to find their own parent record by phone
CREATE POLICY "parents_find_by_phone" ON parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
      AND auth.users.phone IS NOT NULL
      AND auth.users.phone = parents.phone
    )
  );

-- Allow parents to read their kids' player records
CREATE POLICY "parents_read_players" ON players
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE pp.player_id = players.id AND pa.auth_user_id = auth.uid()
    )
  );

-- Allow parents to read player_parents entries for their kids
CREATE POLICY "parents_read_player_parents" ON player_parents
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM parent_auth pa
      JOIN player_parents pp2 ON pp2.parent_id = pa.parent_id
      WHERE pp2.player_id = player_parents.player_id
      AND pa.auth_user_id = auth.uid()
    )
  );

-- Allow parents to read roster entries for their kids
CREATE POLICY "parents_read_roster" ON roster
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE pp.player_id = roster.player_id AND pa.auth_user_id = auth.uid()
    )
  );

-- Allow parents to read teams their kids are on
CREATE POLICY "parents_read_teams" ON teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM roster r
      JOIN player_parents pp ON pp.player_id = r.player_id
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE r.team_id = teams.id AND pa.auth_user_id = auth.uid()
    )
  );

-- Allow parents to read photos of their kids
CREATE POLICY "parents_read_photos" ON player_photos
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE pp.player_id = player_photos.player_id AND pa.auth_user_id = auth.uid()
    )
  );
