-- ── Team Builder — ranked coach preferences ─────────────────────────────────
-- When a parent lists more than one coach ("Justin or Michelle Conn"), we keep
-- the whole ordered list: the first is the primary (also stored in
-- resolved_coach_id), the rest are fallbacks the grouper can use if the primary
-- team is full. Stored as an ordered array of canonical coach names.
ALTER TABLE tb_players ADD COLUMN IF NOT EXISTS coach_options jsonb NOT NULL DEFAULT '[]'::jsonb;
