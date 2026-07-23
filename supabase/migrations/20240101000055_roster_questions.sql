-- ── Roster questions (coach info collection) ────────────────────────────────
-- A coach builds a "list" of questions (e.g. "Jersey # for next season?",
-- "Shirt size?"), targets one or more of their teams, and fills in one answer
-- PER KID on a dashboard. This is a private coach tracker — nothing here is
-- exposed to parents. Everything is owned by the coach (auth.users); user_id is
-- denormalized onto every table so RLS is a uniform "owner full access" check.

-- The list a coach creates ("Next season signups", "Uniform sizes", …).
CREATE TABLE IF NOT EXISTS question_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'open',   -- 'open' | 'closed'
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS question_sets_user ON question_sets (user_id);

-- Which of the coach's teams a list is asking. Kids come from these teams' rosters.
CREATE TABLE IF NOT EXISTS question_set_teams (
  set_id  uuid NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (set_id, team_id)
);
CREATE INDEX IF NOT EXISTS question_set_teams_user ON question_set_teams (user_id);

-- The individual questions inside a list.
CREATE TABLE IF NOT EXISTS questions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id      uuid NOT NULL REFERENCES question_sets(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prompt      text NOT NULL,
  help_text   text,
  answer_type text NOT NULL DEFAULT 'text',   -- 'text' | 'number' | 'select' | 'bool'
  options     text[] NOT NULL DEFAULT '{}',   -- choices for 'select'
  position    int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS questions_set ON questions (set_id);
CREATE INDEX IF NOT EXISTS questions_user ON questions (user_id);

-- One answer per (question, kid). Everything is stored as text; number/bool are
-- serialized ("12", "yes"/"no"). An absent row = still open.
CREATE TABLE IF NOT EXISTS question_answers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  value       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, player_id)
);
CREATE INDEX IF NOT EXISTS question_answers_question ON question_answers (question_id);
CREATE INDEX IF NOT EXISTS question_answers_player ON question_answers (player_id);

-- RLS: owner-only on every table. DROP first so the migration stays re-runnable
-- (Postgres has no CREATE POLICY IF NOT EXISTS).
ALTER TABLE question_sets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_set_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE questions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_answers   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "question_sets: owner full access" ON question_sets;
CREATE POLICY "question_sets: owner full access"
  ON question_sets FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_set_teams: owner full access" ON question_set_teams;
CREATE POLICY "question_set_teams: owner full access"
  ON question_set_teams FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "questions: owner full access" ON questions;
CREATE POLICY "questions: owner full access"
  ON questions FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "question_answers: owner full access" ON question_answers;
CREATE POLICY "question_answers: owner full access"
  ON question_answers FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
