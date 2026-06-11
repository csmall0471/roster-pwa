-- Incremental upgrade for the team-events feature: per-attendee details.
-- Idempotent so it applies cleanly whether or not 0031 was the older version.

-- Player tier flag + per-attendee collection toggle.
ALTER TABLE event_price_tiers
  ADD COLUMN IF NOT EXISTS is_player         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS collect_attendees boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS player_attributes jsonb  NOT NULL DEFAULT '[]'::jsonb,
  -- The coach flags one tier as the "sibling" tier; it remembers & prefills the
  -- family's saved siblings on future signups.
  ADD COLUMN IF NOT EXISTS is_sibling        boolean NOT NULL DEFAULT false;

-- ── Saved siblings per family (parent) ───────────────────────────────────────
-- Remembered across events so the Sibling tier auto-fills next time. A sibling
-- who is also a roster player links via player_id and is excluded from the
-- Sibling tier (they appear under the Player tier instead).
CREATE TABLE IF NOT EXISTS siblings (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid        NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  player_id  uuid        REFERENCES players(id) ON DELETE SET NULL,
  name       text        NOT NULL,
  attributes jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS siblings_parent ON siblings (parent_id);

ALTER TABLE siblings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_all_siblings" ON siblings;
CREATE POLICY "coach_all_siblings" ON siblings
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "parents_own_siblings" ON siblings;
CREATE POLICY "parents_own_siblings" ON siblings
  FOR ALL TO authenticated
  USING      (parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (parent_id = (SELECT parent_id FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Extra per-attendee fields for a tier (e.g. Sibling → shirt size, age).
CREATE TABLE IF NOT EXISTS event_tier_fields (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id     uuid        NOT NULL REFERENCES event_price_tiers(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  field_type  text        NOT NULL DEFAULT 'text',
  options     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  required    boolean     NOT NULL DEFAULT false,
  position    int         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS event_tier_fields_tier ON event_tier_fields (tier_id, position);

ALTER TABLE event_tier_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_all_event_tier_fields" ON event_tier_fields;
CREATE POLICY "coach_all_event_tier_fields" ON event_tier_fields
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

DROP POLICY IF EXISTS "public_read_published_event_tier_fields" ON event_tier_fields;
CREATE POLICY "public_read_published_event_tier_fields" ON event_tier_fields
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM event_price_tiers t
    JOIN events e ON e.id = t.event_id
    WHERE t.id = tier_id AND e.status = 'published'
  ));

-- Signups now store a flat attendee list instead of tier_quantities/players.
-- [{ tier_id, tier_label, amount_cents, is_player, name, attributes }]
ALTER TABLE event_signups
  ADD COLUMN IF NOT EXISTS attendees jsonb NOT NULL DEFAULT '[]'::jsonb;
