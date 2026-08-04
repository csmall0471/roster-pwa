-- ── Event reminder settings ──────────────────────────────────────────────────
-- Per-event control over the automatic reminder email:
--   reminder_days_before — send this many days before the event (NULL = off).
--                          Default 2 preserves the previous hard-coded behavior.
--   reminder_note        — optional coach message included in every reminder.
--   reminder_sent_at     — set when the automatic reminder fires, so the daily
--                          cron never sends it twice. Manual sends ignore it.
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS reminder_days_before int DEFAULT 2,
  ADD COLUMN IF NOT EXISTS reminder_note        text,
  ADD COLUMN IF NOT EXISTS reminder_sent_at     timestamptz;
