-- Whole-series training signup ("package"): parents register a kid once for
-- every date in the series (e.g. 10 sessions for $75) instead of picking dates.
-- Stored on every session row of the series, like title and price already are.
-- A package registration is still one training_signups row per session, so
-- spots, reminders and the parent calendar keep working per date.
ALTER TABLE training_sessions
  ADD COLUMN IF NOT EXISTS package_only  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS package_price text;
