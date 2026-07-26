-- ── Player mailing address ───────────────────────────────────────────────────
-- Home address for a player, populated from the league registration export
-- (street/city/state/zip columns) and editable on the player form.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS street text,
  ADD COLUMN IF NOT EXISTS city   text,
  ADD COLUMN IF NOT EXISTS state  text,
  ADD COLUMN IF NOT EXISTS zip    text;
