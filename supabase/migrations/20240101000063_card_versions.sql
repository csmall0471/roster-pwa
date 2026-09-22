-- ── Card version history (coach-only backend record) ────────────────────────
-- Parents (and coaches) edit a kid's card in place — a single player_photos row
-- per player+team, so returning to the Card Creator continues the current card
-- instead of piling up duplicates. To keep a history anyway, every successful
-- save also appends an immutable snapshot here: the rendered image URLs plus the
-- full card_design at that moment. Private coach data (user_id = the player's
-- coach); parents never read it. Rows are written by the app via the service
-- client, so no INSERT policy is needed.
CREATE TABLE IF NOT EXISTS card_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,  -- the coach (players.user_id)
  player_id       uuid REFERENCES players(id) ON DELETE CASCADE,
  team_id         uuid REFERENCES teams(id) ON DELETE SET NULL,
  card_photo_id     uuid REFERENCES player_photos(id) ON DELETE SET NULL,     -- the live row this version belongs to
  storage_path      text,   -- the exact stored files, so a restore can point back at them
  back_storage_path text,
  public_url        text,
  back_public_url   text,
  card_design       jsonb,
  created_by      uuid,             -- auth.uid() of whoever saved (coach or a parent)
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Idempotent so an earlier apply of this file (before these two columns existed)
-- still gains them on re-run — CREATE TABLE IF NOT EXISTS alone wouldn't.
ALTER TABLE card_versions ADD COLUMN IF NOT EXISTS storage_path      text;
ALTER TABLE card_versions ADD COLUMN IF NOT EXISTS back_storage_path text;

CREATE INDEX IF NOT EXISTS card_versions_owner_player_team
  ON card_versions (user_id, player_id, team_id, created_at DESC);

-- RLS: the coach reads their own version history; nobody else sees it. DROP
-- first so the migration stays re-runnable (no CREATE POLICY IF NOT EXISTS).
ALTER TABLE card_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "card_versions: owner read" ON card_versions;
CREATE POLICY "card_versions: owner read"
  ON card_versions FOR SELECT
  USING (auth.uid() = user_id);
