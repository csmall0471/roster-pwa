-- Admin-added training signups don't have a parent auth record,
-- so parent_id needs to be nullable.
ALTER TABLE training_signups ALTER COLUMN parent_id DROP NOT NULL;
