-- An explicit decline on an event signup. A parent who taps "Can't make it"
-- (or marks every attendee not-attending) gets a signup row with declined=true
-- and a $0 total. Lets the parent dashboard distinguish Going vs Not-going, the
-- coach funnel show a Declined count, and either response clears the pending
-- invite.
ALTER TABLE event_signups
  ADD COLUMN IF NOT EXISTS declined boolean NOT NULL DEFAULT false;
