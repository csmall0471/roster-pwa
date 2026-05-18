ALTER TABLE training_signups ADD COLUMN IF NOT EXISTS paid boolean NOT NULL DEFAULT false;
