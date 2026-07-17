-- ── Roster tags ─────────────────────────────────────────────────────────────
-- Coach-only tagging layer for team rosters. Tag CATEGORIES are reusable across
-- all of a coach's teams (defined once), but each player's VALUE is scoped to
-- the roster entry — i.e. per (team, player) — so a kid can be "Registered" on
-- one team and "Waitlisted" on another. Values live on the roster row (jsonb
-- keyed by tag_type id); definitions live in roster_tag_types.

CREATE TABLE IF NOT EXISTS roster_tag_types (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          text NOT NULL,
  options       text[] NOT NULL DEFAULT '{}',
  -- Per-option color key (palette name), index-aligned with `options`. "" = auto.
  option_colors text[] NOT NULL DEFAULT '{}',
  position      int  NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Idempotent add for DBs where the table predates option_colors.
ALTER TABLE roster_tag_types ADD COLUMN IF NOT EXISTS option_colors text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS roster_tag_types_user ON roster_tag_types (user_id);

ALTER TABLE roster_tag_types ENABLE ROW LEVEL SECURITY;

-- DROP first so the whole migration stays re-runnable (Postgres has no
-- CREATE POLICY IF NOT EXISTS).
DROP POLICY IF EXISTS "roster_tag_types: owner full access" ON roster_tag_types;
CREATE POLICY "roster_tag_types: owner full access"
  ON roster_tag_types FOR ALL
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Per-(team, player) tag values: { "<tag_type_id>": "<option>" }.
ALTER TABLE roster ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '{}'::jsonb;
