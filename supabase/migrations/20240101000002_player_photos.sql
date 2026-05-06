-- ============================================================
-- Player photos — stores one record per season card per player.
-- The storage bucket "player-photos" must be created separately
-- in the Supabase Dashboard (see README for instructions).
-- ============================================================

CREATE TABLE player_photos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url   text NOT NULL,
  team_name    text,
  season       text,
  is_primary   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE player_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_photos: owner full access"
  ON player_photos FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_player_photos_player_id ON player_photos(player_id);
CREATE INDEX idx_player_photos_user_id   ON player_photos(user_id);

-- ── Supabase Storage policies ─────────────────────────────────
-- Run these AFTER creating the "player-photos" bucket in the dashboard.
--
-- CREATE POLICY "upload own photos"
-- ON storage.objects FOR INSERT TO authenticated
-- WITH CHECK (
--   bucket_id = 'player-photos'
--   AND (storage.foldername(name))[1] = auth.uid()::text
-- );
--
-- CREATE POLICY "delete own photos"
-- ON storage.objects FOR DELETE TO authenticated
-- USING (
--   bucket_id = 'player-photos'
--   AND (storage.foldername(name))[1] = auth.uid()::text
-- );
