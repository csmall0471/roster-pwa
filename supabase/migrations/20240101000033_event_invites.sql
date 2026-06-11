-- Tracks who the coach invited to an event (group email recipients), so the
-- dashboard can show an Invited → Opened → Accepted funnel. Opens come from
-- event_views and accepts from event_signups, matched by parent_id.

CREATE TABLE IF NOT EXISTS event_invites (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_id  uuid        REFERENCES parents(id) ON DELETE SET NULL,
  name       text,
  email      text,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, parent_id)
);

CREATE INDEX IF NOT EXISTS event_invites_event ON event_invites (event_id);

ALTER TABLE event_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_all_event_invites" ON event_invites;
CREATE POLICY "coach_all_event_invites" ON event_invites
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));
