-- ── End-of-season awards & notes (coach-only) ───────────────────────────────
-- The team's "End of season" tab lets the coach hand out per-team player awards
-- and jot one closing note per kid. Both are private coach data — nothing here
-- is exposed to parents — so user_id is denormalized onto each table and RLS is
-- a uniform "owner full access" check (auth.uid() = user_id).

-- One row per (team, award, player). An award (award_key) is an ordered list of
-- winners: position 0 = the winner, 1+ = runner-ups in placement order. The
-- absence of any rows for an award_key means it hasn't been decided yet.
CREATE TABLE IF NOT EXISTS team_awards (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  award_key  text NOT NULL,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  position   smallint NOT NULL DEFAULT 0,   -- 0 = winner, 1+ = runner-ups in order
  UNIQUE (user_id, team_id, award_key, player_id)
);
CREATE INDEX IF NOT EXISTS team_awards_user_team ON team_awards (user_id, team_id);

-- One end-of-season note per (team, kid). An absent row = no note written yet.
CREATE TABLE IF NOT EXISTS team_season_notes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  note       text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, team_id, player_id)
);
CREATE INDEX IF NOT EXISTS team_season_notes_user_team ON team_season_notes (user_id, team_id);

-- RLS: owner-only on both tables. DROP first so the migration stays re-runnable
-- (Postgres has no CREATE POLICY IF NOT EXISTS).
ALTER TABLE team_awards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_season_notes  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_awards: owner full access" ON team_awards;
CREATE POLICY "team_awards: owner full access"
  ON team_awards FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "team_season_notes: owner full access" ON team_season_notes;
CREATE POLICY "team_season_notes: owner full access"
  ON team_season_notes FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
