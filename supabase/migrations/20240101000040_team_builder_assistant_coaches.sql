-- ── Team Builder — assistant / co-coaches ───────────────────────────────────
-- A team can have more than one coach. tb_teams.coach_id stays the HEAD coach;
-- additional (assistant) coaches live here. A player whose coach request matches
-- ANY of a team's coaches — head or assistant — is routed to that team during
-- analysis. Still fully isolated (tb_ prefix, owner-only via the season).

CREATE TABLE IF NOT EXISTS tb_team_coaches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id  uuid        NOT NULL REFERENCES tb_seasons(id) ON DELETE CASCADE,
  team_id    uuid        NOT NULL REFERENCES tb_teams(id)   ON DELETE CASCADE,
  coach_id   uuid        NOT NULL REFERENCES tb_coaches(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, coach_id)
);

CREATE INDEX IF NOT EXISTS tb_team_coaches_team   ON tb_team_coaches (team_id);
CREATE INDEX IF NOT EXISTS tb_team_coaches_season ON tb_team_coaches (season_id);

ALTER TABLE tb_team_coaches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_all_tb_team_coaches" ON tb_team_coaches
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM tb_seasons s WHERE s.id = season_id AND s.user_id = auth.uid()));
