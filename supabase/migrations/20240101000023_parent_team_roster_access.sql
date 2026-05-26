-- Allow parents to read ALL roster entries for teams their kids are on
-- (existing "parents_read_roster" only covers their own kids' entries)
CREATE POLICY "parents_read_team_roster" ON roster
  FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT team_id FROM get_my_team_ids())
  );

-- Allow parents to read ALL player records on teams their kids are on
-- (existing "parents_read_players" only covers their own kids)
CREATE POLICY "parents_read_team_players" ON players
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM roster r
      WHERE r.player_id = players.id
        AND r.team_id IN (SELECT team_id FROM get_my_team_ids())
    )
  );

-- Allow parents to read photos for all players on their teams
-- (existing "parents_read_photos" only covers their own kids)
CREATE POLICY "parents_read_team_photos" ON player_photos
  FOR SELECT TO authenticated
  USING (
    player_id IN (
      SELECT r.player_id FROM roster r
      WHERE r.team_id IN (SELECT team_id FROM get_my_team_ids())
    )
  );
