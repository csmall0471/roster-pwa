-- ── Dependent (conditional) form fields ──────────────────────────────────────
-- A field may name a parent field in the same list plus the answer that reveals
-- it (e.g. "Custom jersey?" = Yes → show "Jersey size", "Design", "Number").
-- parent_value semantics by parent type: yesno/checkbox → 'yes' | 'no';
-- select → the option text. NULL parent_field_id = always shown.
-- ON DELETE SET NULL: deleting a parent question makes dependents always-shown
-- rather than silently deleting them.

ALTER TABLE event_fields
  ADD COLUMN IF NOT EXISTS parent_field_id uuid REFERENCES event_fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_value    text;

ALTER TABLE event_tier_fields
  ADD COLUMN IF NOT EXISTS parent_field_id uuid REFERENCES event_tier_fields(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_value    text;
