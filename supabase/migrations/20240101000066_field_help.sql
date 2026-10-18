-- ── Per-question help content ─────────────────────────────────────────────────
-- A form question (event-level or per-attendee tier detail) can carry an
-- explanation and example images — e.g. "Custom jersey?" shows what that means
-- plus photos of the design options. Rendered on the public signup form under
-- the question (and only while a dependent question is visible).

ALTER TABLE event_fields
  ADD COLUMN IF NOT EXISTS help_text   text,
  ADD COLUMN IF NOT EXISTS help_images jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE event_tier_fields
  ADD COLUMN IF NOT EXISTS help_text   text,
  ADD COLUMN IF NOT EXISTS help_images jsonb NOT NULL DEFAULT '[]'::jsonb;
