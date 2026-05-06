-- Add grade and shirt_size to players
-- Run this in Supabase Dashboard > SQL Editor

ALTER TABLE players ADD COLUMN IF NOT EXISTS grade      text;
ALTER TABLE players ADD COLUMN IF NOT EXISTS shirt_size text;
