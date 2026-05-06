ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS organization  text,
  ADD COLUMN IF NOT EXISTS season_start  date,
  ADD COLUMN IF NOT EXISTS season_end    date;
