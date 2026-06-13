-- An event can draw its invite list from MULTIPLE teams (e.g. a combined party
-- for two age groups). events.team_id stays as the "primary" team (used for the
-- email/brand header); event_teams holds the full set whose rosters feed the
-- per-player invite picker. The primary team is also mirrored here.
CREATE TABLE IF NOT EXISTS event_teams (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  team_id  uuid NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  PRIMARY KEY (event_id, team_id)
);

CREATE INDEX IF NOT EXISTS event_teams_event ON event_teams (event_id);

ALTER TABLE event_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_all_event_teams" ON event_teams;
CREATE POLICY "coach_all_event_teams" ON event_teams
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Backfill: every event already tied to a single team gets that link.
INSERT INTO event_teams (event_id, team_id)
SELECT id, team_id FROM events WHERE team_id IS NOT NULL
ON CONFLICT DO NOTHING;
