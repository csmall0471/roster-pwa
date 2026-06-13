-- A per-attendee tier field can adjust that attendee's price. For Yes/No and
-- checkbox fields, answering yes/checked adds price_adjust_cents to the tier's
-- base amount (negative = discount). e.g. base $0, "Water activities?" Yes → $24.
ALTER TABLE event_tier_fields
  ADD COLUMN IF NOT EXISTS price_adjust_cents int NOT NULL DEFAULT 0;
