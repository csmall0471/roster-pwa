-- ── Training sessions ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_sessions (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title             text        NOT NULL,
  description       text,
  location          text,
  session_date      date        NOT NULL,
  session_time      time,
  max_players       int         NOT NULL DEFAULT 10,
  payment_link      text,
  payment_amount    text,
  eligibility_rules jsonb,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS training_sessions_date ON training_sessions (session_date);

-- ── Training signups ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_signups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid        NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  player_id   uuid        NOT NULL REFERENCES players(id)           ON DELETE CASCADE,
  parent_id   uuid        NOT NULL REFERENCES parents(id)           ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, player_id)
);

CREATE INDEX IF NOT EXISTS training_signups_session ON training_signups (session_id);
CREATE INDEX IF NOT EXISTS training_signups_player  ON training_signups (player_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE training_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_signups  ENABLE ROW LEVEL SECURITY;

-- Coach gets full access to training sessions
CREATE POLICY "coach_all_training_sessions" ON training_sessions
  FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Coach gets full access to training signups
CREATE POLICY "coach_all_training_signups" ON training_signups
  FOR ALL TO authenticated
  USING (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Parents can read all training sessions (eligibility filtering happens in app layer)
CREATE POLICY "parents_read_training_sessions" ON training_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Parents can read all training signups (slot counts + their own status)
CREATE POLICY "parents_read_training_signups" ON training_signups
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Parents can sign up their own kids
CREATE POLICY "parents_insert_training_signup" ON training_signups
  FOR INSERT TO authenticated
  WITH CHECK (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  );

-- Parents can cancel their own signups
CREATE POLICY "parents_delete_training_signup" ON training_signups
  FOR DELETE TO authenticated
  USING (
    parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid())
  );
