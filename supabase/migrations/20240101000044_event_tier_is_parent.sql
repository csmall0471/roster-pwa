-- A tier can be flagged as the "parent" tier (like is_sibling): on the signup
-- form it pre-fills one attendee with the signed-in parent's own name, so a
-- parent can add themselves to the event in one tap.
ALTER TABLE event_price_tiers
  ADD COLUMN IF NOT EXISTS is_parent boolean NOT NULL DEFAULT false;
