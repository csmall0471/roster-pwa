-- ── Named interest lists + roster-player membership ──────────────────────────
-- Interest lists graduate from implicit sport buckets to named lists
-- (interest_list_groups). Entries (interest_lists rows) belong to a list and
-- can now be a linked ROSTER PLAYER (player_id) instead of a hand-typed
-- contact — their parents' emails are resolved live at compose time.

CREATE TABLE IF NOT EXISTS interest_list_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text        NOT NULL,
  sport      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE interest_list_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interest_list_groups: owner full access" ON interest_list_groups;
CREATE POLICY "interest_list_groups: owner full access"
  ON interest_list_groups FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_interest_list_groups_user ON interest_list_groups(user_id);

ALTER TABLE interest_lists
  ADD COLUMN IF NOT EXISTS list_id   uuid REFERENCES interest_list_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES players(id) ON DELETE CASCADE;

-- Entries now take their grouping from the list, not the sport column.
ALTER TABLE interest_lists ALTER COLUMN sport DROP NOT NULL;

-- A roster player appears at most once per list.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_interest_player_per_list
  ON interest_lists(list_id, player_id) WHERE player_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interest_lists_list ON interest_lists(list_id);
