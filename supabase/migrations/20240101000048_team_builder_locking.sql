-- Locking: a coach can pin a finished team (or a whole division) so re-planning
-- leaves it exactly as-is. Regeneration skips locked divisions entirely and
-- excludes locked teams + their players from the re-plan; everything else is
-- balanced around them. Owner-only via the season (existing tb_ RLS covers it).

ALTER TABLE tb_teams     ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
ALTER TABLE tb_divisions ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false;
