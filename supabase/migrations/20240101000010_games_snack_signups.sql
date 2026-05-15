-- ── Snack signup config on teams ─────────────────────────────────────────────
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS snack_signup_enabled  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS snack_slots_per_game  int     NOT NULL DEFAULT 1;

-- ── Games / schedule ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS games (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_date   date        NOT NULL,
  game_time   time,
  opponent    text,
  location    text,
  is_home     boolean     NOT NULL DEFAULT true,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS games_team_id_date ON games (team_id, game_date);

-- ── Snack signups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS snack_signups (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id        uuid        NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  parent_id      uuid        NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  slot_number    int         NOT NULL DEFAULT 1,
  reminder_email boolean     NOT NULL DEFAULT true,
  reminder_sms   boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, slot_number)
);

CREATE INDEX IF NOT EXISTS snack_signups_game_id ON snack_signups (game_id);
CREATE INDEX IF NOT EXISTS snack_signups_parent_id ON snack_signups (parent_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE snack_signups ENABLE ROW LEVEL SECURITY;

-- Coach (no parent_auth row) gets full access to games
CREATE POLICY "coach_all_games" ON games
  FOR ALL TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid())
  );

-- Parents can read games for teams their kids are on
CREATE POLICY "parents_read_games" ON games
  FOR SELECT TO authenticated
  USING (
    team_id IN (SELECT team_id FROM get_my_team_ids())
  );

-- Coach gets full access to snack_signups
CREATE POLICY "coach_all_signups" ON snack_signups
  FOR ALL TO authenticated
  USING (
    NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid())
  );

-- Parents can read signups for their teams' games
CREATE POLICY "parents_read_signups" ON snack_signups
  FOR SELECT TO authenticated
  USING (
    game_id IN (
      SELECT g.id FROM games g
      WHERE g.team_id IN (SELECT team_id FROM get_my_team_ids())
    )
  );

-- Parents can insert their own signup only
CREATE POLICY "parents_insert_own_signup" ON snack_signups
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  );

-- Parents can update their own signup (reminder preferences)
CREATE POLICY "parents_update_own_signup" ON snack_signups
  FOR UPDATE TO authenticated
  USING (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  )
  WITH CHECK (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  );

-- Parents can delete their own signup
CREATE POLICY "parents_delete_own_signup" ON snack_signups
  FOR DELETE TO authenticated
  USING (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  );
