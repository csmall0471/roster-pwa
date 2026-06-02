-- Add fields for the back-side of a player card.
-- Front-side image lives in storage_path / public_url; back lives here.
ALTER TABLE player_photos
  ADD COLUMN IF NOT EXISTS back_storage_path text,
  ADD COLUMN IF NOT EXISTS back_public_url   text;
