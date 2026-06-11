-- ── Team Builder — resolution layer ─────────────────────────────────────────
-- Canonical entities produced by the resolution engine (fuzzy + Claude) once
-- the coach confirms them, plus the player→entity references and buddy links
-- that Phase 3 grouping consumes. Still fully isolated (tb_ prefix, scoped to
-- seasons the owner owns).

CREATE TABLE IF NOT EXISTS tb_coaches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  name       text        NOT NULL,           -- canonical coach name
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, name)
);

CREATE TABLE IF NOT EXISTS tb_team_names (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  name       text        NOT NULL,           -- canonical requested team name
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, name)
);

-- A confirmed buddy/family request: from_player wants to be with to_player.
CREATE TABLE IF NOT EXISTS tb_buddy_links (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  from_player_id uuid        NOT NULL REFERENCES tb_players(id) ON DELETE CASCADE,
  to_player_id   uuid        NOT NULL REFERENCES tb_players(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_id, from_player_id, to_player_id)
);

CREATE INDEX IF NOT EXISTS tb_buddy_links_season ON tb_buddy_links (season_id);

-- Player → canonical entity references (set when resolution is applied).
ALTER TABLE tb_players ADD COLUMN IF NOT EXISTS resolved_coach_id     uuid REFERENCES tb_coaches(id)    ON DELETE SET NULL;
ALTER TABLE tb_players ADD COLUMN IF NOT EXISTS resolved_team_name_id uuid REFERENCES tb_team_names(id) ON DELETE SET NULL;

ALTER TABLE tb_coaches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_team_names  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tb_buddy_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_tb_coaches" ON tb_coaches
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));

CREATE POLICY "owner_all_tb_team_names" ON tb_team_names
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));

CREATE POLICY "owner_all_tb_buddy_links" ON tb_buddy_links
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));
