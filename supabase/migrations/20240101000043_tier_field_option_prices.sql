-- Per-option pricing for a select-type attendee field: a cents amount aligned
-- by index with event_tier_fields.options. Picking an option adds its amount to
-- the attendee's price. e.g. options ["Standard","Premium"], option_prices [0,1000]
-- → choosing "Premium" adds $10.
ALTER TABLE event_tier_fields
  ADD COLUMN IF NOT EXISTS option_prices jsonb NOT NULL DEFAULT '[]'::jsonb;
