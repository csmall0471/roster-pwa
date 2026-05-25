ALTER TABLE training_signups
  ADD COLUMN IF NOT EXISTS reminder_email bool NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_sms   bool NOT NULL DEFAULT false;
