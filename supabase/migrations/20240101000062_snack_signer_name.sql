-- Show fellow parents who signed up for each snack slot.
-- RLS already lets a parent read every snack_signups row on their team's games
-- ("parents_read_signups"), but the parents table only exposes their OWN
-- family's names ("parents_read_linked"), so other families' signups rendered as
-- "Someone". Denormalize just the signer's DISPLAY NAME onto the signup row —
-- name only, never email/phone — so it's visible to teammates without widening
-- access to the parents table.
ALTER TABLE snack_signups ADD COLUMN IF NOT EXISTS signer_name text;

-- Backfill existing signups from the parents table (this migration runs as the
-- table owner, bypassing RLS, so it can resolve every name).
UPDATE snack_signups s
SET signer_name = btrim(coalesce(p.first_name, '') || ' ' || coalesce(p.last_name, ''))
FROM parents p
WHERE p.id = s.parent_id
  AND (s.signer_name IS NULL OR s.signer_name = '');
