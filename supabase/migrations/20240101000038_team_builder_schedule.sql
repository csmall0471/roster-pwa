-- ── Team Builder — practice schedule (Phase 4) ──────────────────────────────
-- Each generated team gets a practice day (already `practice_night`), plus a
-- time and field. The set of fields and the daily time window live on the
-- season as `schedule_config` jsonb: { fields: string[], start, end, slot }.
-- Still fully isolated / owner-only via the season (existing RLS covers it).

ALTER TABLE tb_teams ADD COLUMN IF NOT EXISTS practice_time text; -- "HH:MM" 24h, or null
ALTER TABLE tb_teams ADD COLUMN IF NOT EXISTS field text;         -- field name, or null

ALTER TABLE tb_seasons
  ADD COLUMN IF NOT EXISTS schedule_config jsonb NOT NULL DEFAULT '{}'::jsonb;
