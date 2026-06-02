-- Let parents and coaches delete player_photos, not just the original uploader.
--
-- Existing "player_photos: owner full access" already covers DELETE for the
-- row's owner. These additive policies extend DELETE to:
--   • parents — for any photo of their own kid
--   • coaches — for any photo of a player on a team they own
--
-- Note: this does NOT delete the underlying storage object. The bucket policy
-- is user-prefix-based so cross-owner storage deletes silently fail. The DB
-- row removal is enough to hide the card from the UI; orphaned objects can be
-- swept later.

CREATE POLICY "parents_delete_kid_photos" ON player_photos
  FOR DELETE TO authenticated
  USING (
    player_id IN (SELECT player_id FROM get_my_player_ids())
  );

CREATE POLICY "coach_delete_team_photos" ON player_photos
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM roster r
      JOIN teams t ON t.id = r.team_id
      WHERE r.player_id = player_photos.player_id
        AND t.user_id = auth.uid()
    )
  );
