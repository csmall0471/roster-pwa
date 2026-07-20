-- Saved Google Sheet link for a Roster Creator season, so coaches and practice
-- times can be re-pulled ("Refresh from sheet") from the same source later.
ALTER TABLE tb_seasons ADD COLUMN IF NOT EXISTS practice_sheet_url text;
