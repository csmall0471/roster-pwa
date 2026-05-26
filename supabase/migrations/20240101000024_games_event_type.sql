-- Add event_type and title columns to support practices and other events
-- alongside games in the schedule
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'game',
  ADD COLUMN IF NOT EXISTS title      text;

ALTER TABLE games
  ADD CONSTRAINT games_event_type_check
    CHECK (event_type IN ('game', 'practice', 'other'));
