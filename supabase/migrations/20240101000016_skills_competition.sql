CREATE TABLE IF NOT EXISTS skills_sessions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  session_date date NOT NULL,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS skills_attempts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  skills_session_id uuid NOT NULL REFERENCES skills_sessions(id) ON DELETE CASCADE,
  player_id         uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  -- Skills Course (stopwatch, stored in milliseconds)
  course_time_ms    integer CHECK (course_time_ms IS NULL OR course_time_ms >= 0),
  -- Free Throws (10 attempts fixed, 1 pt each)
  free_throw_makes  integer CHECK (free_throw_makes IS NULL OR (free_throw_makes >= 0 AND free_throw_makes <= 10)),
  -- Hot Shots (makes per position)
  hot_shots_8pt     integer NOT NULL DEFAULT 0 CHECK (hot_shots_8pt >= 0),
  hot_shots_7pt     integer NOT NULL DEFAULT 0 CHECK (hot_shots_7pt >= 0),
  hot_shots_5pt     integer NOT NULL DEFAULT 0 CHECK (hot_shots_5pt >= 0),
  hot_shots_3pt     integer NOT NULL DEFAULT 0 CHECK (hot_shots_3pt >= 0),
  hot_shots_2pt     integer NOT NULL DEFAULT 0 CHECK (hot_shots_2pt >= 0 AND hot_shots_2pt <= 8),
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE(skills_session_id, player_id)
);

ALTER TABLE skills_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_attempts  ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (parents need this for their kids' results)
CREATE POLICY "skills_sessions_read" ON skills_sessions
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only coaches (users who own a team) can write
CREATE POLICY "skills_sessions_write" ON skills_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE user_id = auth.uid())
  );

CREATE POLICY "skills_attempts_read" ON skills_attempts
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "skills_attempts_write" ON skills_attempts
  FOR ALL USING (
    EXISTS (SELECT 1 FROM teams WHERE user_id = auth.uid())
  );
