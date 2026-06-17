-- Bulk JSON import of players from a league registration export.
-- external_id = the registration system's stable person id (memberPersonId).
-- It lets an incoming record match an existing player so a re-import UPDATES
-- rather than duplicates. gender / weight come straight from the export.
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS gender      text,
  ADD COLUMN IF NOT EXISTS weight      smallint;

-- One player per (owner, registration id). Partial so manually-added players
-- (no external id) are unaffected and several may coexist.
CREATE UNIQUE INDEX IF NOT EXISTS uq_players_user_external
  ON players(user_id, external_id) WHERE external_id IS NOT NULL;
