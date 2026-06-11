-- ── Team Builder — authoritative coach/team roster ──────────────────────────
-- New flow: the coach uploads a workbook (one sheet per division, one row per
-- team — a coach name or a "Team N" placeholder) BEFORE importing players. That
-- file is the source of truth for divisions, coaches, and the team count per
-- division. Teams are therefore created up front (here) and generation only
-- ASSIGNS players into them — it no longer invents teams. Two consequences:
--   • tb_teams gains a coach link + a placeholder flag.
--   • each division carries its own target roster size (players per team).
-- Still fully isolated (tb_ prefix, owner-only via the season's RLS policies).

-- A coached team points at its coach; "Team N" placeholders leave it null. A
-- coach who leads a team in two divisions = two tb_teams rows sharing one
-- tb_coaches.id, which keeps the season-level "coaches multiple teams" stat right.
ALTER TABLE tb_teams ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES tb_coaches(id) ON DELETE SET NULL;

-- Open fill-bucket created from a "Team N" row: no coach yet, balanced into.
ALTER TABLE tb_teams ADD COLUMN IF NOT EXISTS is_placeholder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS tb_teams_coach ON tb_teams (coach_id);

-- Per-division players-per-team target. null = fall back to the season default
-- (grouping_config.target). The team COUNT is fixed by the uploaded file; this
-- is the size the balancer aims for and a soft cap so a popular coach's team
-- doesn't overflow.
ALTER TABLE tb_divisions ADD COLUMN IF NOT EXISTS target_team_size int;
