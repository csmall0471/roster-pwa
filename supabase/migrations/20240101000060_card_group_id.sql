-- Group cards (duo/trio saved to every featured player).
-- card_group_id is null for a normal single-player card. For a group card the
-- same uuid is written on the per-player rows (one per featured player) so an
-- edit or delete of any copy can find and update/remove all of them together.
ALTER TABLE player_photos ADD COLUMN IF NOT EXISTS card_group_id uuid;
