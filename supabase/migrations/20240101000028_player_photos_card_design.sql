-- Store the editable card composition so users can re-open and tweak
-- a generated card later instead of starting from scratch.
ALTER TABLE player_photos
  ADD COLUMN IF NOT EXISTS card_design jsonb;
