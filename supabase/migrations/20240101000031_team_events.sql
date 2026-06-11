-- ── Team events (coach-created, public signup pages) ─────────────────────────
-- A "Google Forms"-style event signup. The coach creates an event with custom
-- form fields and price tiers, publishes it, and shares an unguessable slug
-- link. Anyone with the link can open it (anonymously) and sign up; logged-in
-- parents get their info pre-filled. Link opens are tracked for metrics.

CREATE TABLE IF NOT EXISTS events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          uuid        REFERENCES teams(id) ON DELETE SET NULL,
  slug             text        NOT NULL UNIQUE,
  title            text        NOT NULL,
  description      text,
  location         text,
  starts_at        timestamptz,
  ends_at          timestamptz,
  image_urls       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pay_url          text,
  pay_instructions text,
  signup_deadline  timestamptz,
  status           text        NOT NULL DEFAULT 'draft',  -- draft | published | closed
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS events_slug ON events (slug);
CREATE INDEX IF NOT EXISTS events_team ON events (team_id);

-- ── Custom form fields (the form builder) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_fields (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  field_type  text        NOT NULL DEFAULT 'text', -- text|textarea|number|select|checkbox|yesno
  options     jsonb       NOT NULL DEFAULT '[]'::jsonb, -- choices for select
  required    boolean     NOT NULL DEFAULT false,
  position    int         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS event_fields_event ON event_fields (event_id, position);

-- ── Price tiers (Player $12, Sibling $15, Parent $30, …) ─────────────────────
CREATE TABLE IF NOT EXISTS event_price_tiers (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  label        text        NOT NULL,
  amount_cents int         NOT NULL DEFAULT 0,
  position     int         NOT NULL DEFAULT 0,
  -- The "player" tier is always present and is what a signed-in parent's kids
  -- map to. Sibling/parent/etc. tiers are optional extras (is_player = false).
  is_player    boolean     NOT NULL DEFAULT false,
  -- When true, the signup form collects a name (+ any tier fields) for each
  -- attendee in this tier instead of just a quantity.
  collect_attendees boolean NOT NULL DEFAULT false,
  -- For the player tier: which roster attributes to prefill per kid (editable
  -- by the parent). Keys from a fixed catalog, e.g. ["grade","shirt_size"].
  player_attributes jsonb   NOT NULL DEFAULT '[]'::jsonb,
  -- One tier may be flagged as the "sibling" tier; it remembers & prefills the
  -- family's saved siblings (see the siblings table in migration 0032).
  is_sibling        boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS event_price_tiers_event ON event_price_tiers (event_id, position);

-- ── Per-attendee fields for a tier (e.g. Sibling → shirt size, age) ──────────
-- A name is always collected per attendee; these are extra attributes.
CREATE TABLE IF NOT EXISTS event_tier_fields (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_id     uuid        NOT NULL REFERENCES event_price_tiers(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  field_type  text        NOT NULL DEFAULT 'text', -- text|textarea|number|select|checkbox|yesno
  options     jsonb       NOT NULL DEFAULT '[]'::jsonb,
  required    boolean     NOT NULL DEFAULT false,
  position    int         NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS event_tier_fields_tier ON event_tier_fields (tier_id, position);

-- ── Signups ──────────────────────────────────────────────────────────────────
-- parent_id is nullable: guests (no account) sign up too. tier_quantities and
-- responses are jsonb snapshots so edits to the event don't rewrite history.
CREATE TABLE IF NOT EXISTS event_signups (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id        uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_id       uuid        REFERENCES parents(id) ON DELETE SET NULL,
  name            text        NOT NULL,
  email           text,
  phone           text,
  responses       jsonb       NOT NULL DEFAULT '{}'::jsonb,  -- { field_id: value }
  -- One entry per paid unit. For attendee-collecting tiers, name + attributes
  -- are captured; for count-only tiers, name is null and qty is the entry count.
  -- [{ tier_id, tier_label, amount_cents, is_player, name, attributes }]
  attendees       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  total_cents     int         NOT NULL DEFAULT 0,
  paid            boolean     NOT NULL DEFAULT false,
  paid_at         timestamptz,
  coach_notes     text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_signups_event  ON event_signups (event_id);
CREATE INDEX IF NOT EXISTS event_signups_parent ON event_signups (parent_id);

-- ── Link-open metrics ────────────────────────────────────────────────────────
-- One row per page open. parent_id is set once a visitor verifies their phone;
-- otherwise visitor_key (an anonymous cookie) lets us dedupe/count unique opens.
CREATE TABLE IF NOT EXISTS event_views (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    uuid        NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  parent_id   uuid        REFERENCES parents(id) ON DELETE SET NULL,
  visitor_key text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_views_event ON event_views (event_id, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE events            ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_fields      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_price_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_tier_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_signups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_views       ENABLE ROW LEVEL SECURITY;

-- Coach (authenticated user with no parent_auth row) gets full access.
CREATE POLICY "coach_all_events" ON events
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

CREATE POLICY "coach_all_event_fields" ON event_fields
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

CREATE POLICY "coach_all_event_price_tiers" ON event_price_tiers
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

CREATE POLICY "coach_all_event_tier_fields" ON event_tier_fields
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

CREATE POLICY "coach_all_event_signups" ON event_signups
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

CREATE POLICY "coach_all_event_views" ON event_views
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));

-- Public (anon + any authenticated user) can read PUBLISHED events and their
-- fields/tiers. The unguessable slug is the access control; published-only keeps
-- drafts private.
CREATE POLICY "public_read_published_events" ON events
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

CREATE POLICY "public_read_published_event_fields" ON event_fields
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.status = 'published'));

CREATE POLICY "public_read_published_event_tiers" ON event_price_tiers
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.status = 'published'));

CREATE POLICY "public_read_published_event_tier_fields" ON event_tier_fields
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM event_price_tiers t
    JOIN events e ON e.id = t.event_id
    WHERE t.id = tier_id AND e.status = 'published'
  ));

-- Anyone can sign up for / log a view on a published event. They cannot read
-- back others' signups (no public SELECT policy on event_signups).
CREATE POLICY "public_insert_event_signups" ON event_signups
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.status = 'published'));

CREATE POLICY "public_insert_event_views" ON event_views
  FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM events e WHERE e.id = event_id AND e.status = 'published'));

-- ── Storage bucket for event images (public read, coach-only write) ──────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('event-images', 'event-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "event_images_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-images');

CREATE POLICY "event_images_coach_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'event-images'
    AND NOT EXISTS (SELECT 1 FROM public.parent_auth WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "event_images_coach_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'event-images'
    AND NOT EXISTS (SELECT 1 FROM public.parent_auth WHERE auth_user_id = auth.uid())
  );
