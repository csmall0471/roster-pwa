-- ============================================================
-- Roster PWA — initial schema
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================

-- ── Teams ────────────────────────────────────────────────────
CREATE TABLE teams (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  season      text NOT NULL DEFAULT '',
  sport       text NOT NULL DEFAULT '',
  age_group   text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams: owner full access"
  ON teams FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Players ──────────────────────────────────────────────────
CREATE TABLE players (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name     text NOT NULL,
  last_name      text NOT NULL,
  date_of_birth  date,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players: owner full access"
  ON players FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Parents ──────────────────────────────────────────────────
CREATE TABLE parents (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name  text NOT NULL,
  last_name   text NOT NULL,
  email       text NOT NULL,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parents: owner full access"
  ON parents FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Player ↔ Parent join ──────────────────────────────────────
CREATE TABLE player_parents (
  player_id    uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  parent_id    uuid NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship text NOT NULL DEFAULT 'parent',
  PRIMARY KEY (player_id, parent_id)
);

ALTER TABLE player_parents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "player_parents: owner full access"
  ON player_parents FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Roster ───────────────────────────────────────────────────
CREATE TABLE roster (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id        uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id      uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  jersey_number  smallint,
  status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, player_id)
);

ALTER TABLE roster ENABLE ROW LEVEL SECURITY;

CREATE POLICY "roster: owner full access"
  ON roster FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX idx_teams_user_id        ON teams(user_id);
CREATE INDEX idx_players_user_id      ON players(user_id);
CREATE INDEX idx_parents_user_id      ON parents(user_id);
CREATE INDEX idx_roster_team_id       ON roster(team_id);
CREATE INDEX idx_roster_player_id     ON roster(player_id);
CREATE INDEX idx_player_parents_pid   ON player_parents(player_id);
CREATE INDEX idx_player_parents_parid ON player_parents(parent_id);
