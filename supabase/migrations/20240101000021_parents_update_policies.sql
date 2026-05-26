-- Parents can update their own kids' player info (name, dob, grade, shirt_size, notes)
CREATE POLICY "parents_update_own_players" ON players
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE pp.player_id = players.id AND pa.auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM player_parents pp
      JOIN parent_auth pa ON pa.parent_id = pp.parent_id
      WHERE pp.player_id = players.id AND pa.auth_user_id = auth.uid()
    )
  );

-- Parents can update their own parent record (name, email, phone)
CREATE POLICY "parents_update_own_record" ON parents
  FOR UPDATE TO authenticated
  USING (id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid()));
