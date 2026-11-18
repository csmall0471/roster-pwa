-- Per-date RSVP for whole-series ("package") training registrations: a kid is
-- registered (and pays) for every date, and defaults to attending each one.
-- A parent can mark a date they'll miss; the kid keeps the spot and the price
-- doesn't change. Reminder emails skip dates marked not attending.
-- Parents change this through a server action (service role, after checking
-- the kid is theirs), so no new RLS policy is needed.
ALTER TABLE training_signups
  ADD COLUMN IF NOT EXISTS attending boolean NOT NULL DEFAULT true;
