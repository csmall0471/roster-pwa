-- ── Team Builder (Roster Creator admin tool) ────────────────────────────────
-- Fully ISOLATED from the rest of the app. Holds external team-signup exports
-- (CSV/Excel) and the work of grouping those signups into teams. No foreign
-- keys into teams/players/etc. — nothing here can affect the live roster app.
-- Coach/owner only; parents never see this. All tables are prefixed `tb_`.
--
-- Hierarchy:  Season → Division → (Team, later) → Player
--   Season    a persistent workspace (e.g. "Fall Football 2026"); sport is a
--             label, not its own level. Files are imported INTO a season and
--             more can be appended later.
--   Division  first-class (auto-created per package_name on import, or added by
--             hand). A player's division is editable, separate from the
--             original package_name, so players can be moved across divisions.

CREATE TABLE IF NOT EXISTS tb_seasons (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL DEFAULT auth.uid(),
  name       text        NOT NULL,
  sport      text,                                   -- label only, e.g. "Flag Football"
  status     text        NOT NULL DEFAULT 'draft',   -- draft | grouped | exported
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tb_seasons_user ON tb_seasons (user_id, created_at DESC);

-- One uploaded file, for provenance and per-file column mapping.
CREATE TABLE IF NOT EXISTS tb_imports (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  source_filename text,
  headers         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  column_mapping  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  row_count       int         NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tb_imports_season ON tb_imports (season_id, created_at);

CREATE TABLE IF NOT EXISTS tb_divisions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id     uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  name          text        NOT NULL,
  -- Team-size constraints (used in Phase 3 grouping; null = use season default).
  min_team_size int,
  max_team_size int,
  position      int         NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, name)
);

CREATE INDEX IF NOT EXISTS tb_divisions_season ON tb_divisions (season_id, position);

-- One signup row. Canonical fields are materialized from the file via the
-- import's column mapping; `raw` keeps the original row for reference.
-- `package_name` is the original division string (provenance); `division_id`
-- is the player's editable home division.
CREATE TABLE IF NOT EXISTS tb_players (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id       uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  import_id       uuid        REFERENCES tb_imports(id) ON DELETE SET NULL,
  division_id     uuid        REFERENCES tb_divisions(id) ON DELETE SET NULL,
  first_name      text        NOT NULL DEFAULT '',
  last_name       text        NOT NULL DEFAULT '',
  gender          text        NOT NULL DEFAULT '',
  age_group       text        NOT NULL DEFAULT '',
  package_name    text        NOT NULL DEFAULT '',
  school          text        NOT NULL DEFAULT '',
  coach_first     text        NOT NULL DEFAULT '',
  coach_last      text        NOT NULL DEFAULT '',
  team_name       text        NOT NULL DEFAULT '',
  buddy_first     text        NOT NULL DEFAULT '',
  buddy_last      text        NOT NULL DEFAULT '',
  practice_nights text        NOT NULL DEFAULT '',
  raw             jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tb_players_season   ON tb_players (season_id);
CREATE INDEX IF NOT EXISTS tb_players_division ON tb_players (division_id);

-- ── RLS: owner only (authenticated, no parent_auth row) and scoped to seasons
-- they own. Parents and anon get nothing. ───────────────────────────────────
ALTER TABLE tb_seasons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_imports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_players   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_tb_seasons" ON tb_seasons
  FOR ALL TO authenticated
  USING      (user_id = auth.uid()
              AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (user_id = auth.uid()
              AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Child tables: caller must own the parent season (and not be a parent).
CREATE POLICY "owner_all_tb_imports" ON tb_imports
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));

CREATE POLICY "owner_all_tb_divisions" ON tb_divisions
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));

CREATE POLICY "owner_all_tb_players" ON tb_players
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));
