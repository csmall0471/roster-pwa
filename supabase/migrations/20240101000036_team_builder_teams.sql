-- ── Team Builder — generated teams (Phase 3) ─────────────────────────────────
-- The output of the grouping engine: teams within a division, and each
-- player's team assignment. Still fully isolated, owner-only via the season.

CREATE TABLE IF NOT EXISTS tb_teams (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id      uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  division_id    uuid        NOT NULL REFERENCES tb_divisions(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  practice_night text,                       -- chosen practice night, or null
  position       int         NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tb_teams_division ON tb_teams (division_id, position);
CREATE INDEX IF NOT EXISTS tb_teams_season   ON tb_teams (season_id);

ALTER TABLE tb_players ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES tb_teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tb_players_team ON tb_players (team_id);

-- Grouping settings (team size + criterion weights) live on the season.
ALTER TABLE tb_seasons ADD COLUMN IF NOT EXISTS grouping_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tb_teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_tb_teams" ON tb_teams
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));
