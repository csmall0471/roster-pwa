-- ── Player rankings (coach's private favorites tracker) ─────────────────────
-- The coach rates each player 1–10 on five equally-weighted qualities, and the
-- Players → Ranking tab orders players by the combined score. Private to the
-- coach: one row per (coach, player), owner-only RLS. A missing row means the
-- player hasn't been rated yet (the UI treats every quality as a neutral 5).
CREATE TABLE IF NOT EXISTS player_ratings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  player_id     uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  good_person   smallint NOT NULL DEFAULT 5 CHECK (good_person  BETWEEN 1 AND 10),
  coachable     smallint NOT NULL DEFAULT 5 CHECK (coachable    BETWEEN 1 AND 10),
  personality   smallint NOT NULL DEFAULT 5 CHECK (personality  BETWEEN 1 AND 10),
  teammate      smallint NOT NULL DEFAULT 5 CHECK (teammate     BETWEEN 1 AND 10),
  hard_working  smallint NOT NULL DEFAULT 5 CHECK (hard_working BETWEEN 1 AND 10),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, player_id)
);
CREATE INDEX IF NOT EXISTS player_ratings_user   ON player_ratings (user_id);
CREATE INDEX IF NOT EXISTS player_ratings_player ON player_ratings (player_id);

-- RLS: owner-only. DROP first so the migration stays re-runnable.
ALTER TABLE player_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "player_ratings: owner full access" ON player_ratings;
CREATE POLICY "player_ratings: owner full access"
  ON player_ratings FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
