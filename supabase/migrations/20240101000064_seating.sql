-- ── Seating planner (admin tool) ─────────────────────────────────────────────
-- A coach tool for planning who sits where at a venue (e.g. a Suns game suite):
-- a plan owns a virtual-canvas layout of zones (seat clusters, a standing-room
-- area, decorative tables) and the seats inside them, plus a people list pulled
-- from team rosters and/or an event's RSVPs. Optionally links to an `events`
-- row so RSVP status drives each person's planning funnel, and collects
-- "who do you want to sit by" picks from the event signup form.

-- One plan per outing. event_id is optional — a plan works standalone and can
-- be linked to an event later (SET NULL keeps the plan if the event goes away).
CREATE TABLE IF NOT EXISTS seating_plans (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text        NOT NULL,
  event_id   uuid        REFERENCES events(id) ON DELETE SET NULL,
  notes      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Layout zones on the virtual canvas. kind: 'cluster' (a labeled group of
-- seats), 'sro' (standing room — capacity-counted, no individual spots), or
-- 'table' (decorative, no drop behavior). x/y is the top-left anchor in
-- virtual-canvas px; rotation in degrees. capacity applies to sro only.
-- position gives clusters a stable ordering (BL number) for labels/auto-assign.
CREATE TABLE IF NOT EXISTS seating_zones (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id    uuid        NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  kind       text        NOT NULL DEFAULT 'cluster',  -- cluster | sro | table
  label      text        NOT NULL DEFAULT '',
  x          int         NOT NULL DEFAULT 0,
  y          int         NOT NULL DEFAULT 0,
  rotation   int         NOT NULL DEFAULT 0,
  w          int         NOT NULL DEFAULT 0,
  h          int         NOT NULL DEFAULT 0,
  capacity   int,
  position   int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seating_zones_plan ON seating_zones (plan_id);

-- Individual seats. zone_id null = a loose seat placed directly on the canvas
-- (x/y canvas-absolute); otherwise x/y are zone-local px (pre-rotation).
-- unavailable = not owned / blocked — never assignable.
CREATE TABLE IF NOT EXISTS seating_seats (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid        NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  zone_id     uuid        REFERENCES seating_zones(id) ON DELETE CASCADE,
  label       text        NOT NULL DEFAULT '',
  x           int         NOT NULL DEFAULT 0,
  y           int         NOT NULL DEFAULT 0,
  unavailable boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seating_seats_plan ON seating_seats (plan_id);
CREATE INDEX IF NOT EXISTS seating_seats_zone ON seating_seats (zone_id);

-- The people being seated. kind: player | sibling | parent | guest. Links back
-- to real records where known (player_id / parent_id / source_team_id) so RSVP
-- status and family grouping can be derived; manual_status is an admin override
-- of that derivation (null = derive). seat_id is the assignment (SET NULL when
-- a seat is deleted); in_sro parks someone in the standing area instead.
-- locked = auto-assign may not move them.
CREATE TABLE IF NOT EXISTS seating_people (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid        NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  kind           text        NOT NULL DEFAULT 'player',  -- player | sibling | parent | guest
  display_name   text        NOT NULL,
  player_id      uuid        REFERENCES players(id) ON DELETE SET NULL,
  parent_id      uuid        REFERENCES parents(id) ON DELETE SET NULL,
  source_team_id uuid        REFERENCES teams(id)   ON DELETE SET NULL,
  manual_status  text,                                   -- null | planning | invited | opened | no | yes
  seat_id        uuid        REFERENCES seating_seats(id) ON DELETE SET NULL,
  in_sro         boolean     NOT NULL DEFAULT false,
  locked         boolean     NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS seating_people_plan ON seating_people (plan_id);

-- One body per seat; one row per real player/parent per plan; named sibling/
-- guest entries unique by (kind, name) within a plan — the add actions dedupe
-- first, these indexes backstop races.
CREATE UNIQUE INDEX IF NOT EXISTS seating_people_one_per_seat
  ON seating_people (seat_id) WHERE seat_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS seating_people_player_once
  ON seating_people (plan_id, player_id) WHERE player_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS seating_people_parent_once
  ON seating_people (plan_id, parent_id) WHERE parent_id IS NOT NULL AND kind = 'parent';
CREATE UNIQUE INDEX IF NOT EXISTS seating_people_named_once
  ON seating_people (plan_id, kind, lower(display_name)) WHERE kind IN ('sibling','guest');

-- Admin-entered "A wants to sit by B" edges between plan people (the event-side
-- equivalent lives in event_sit_by_picks and is merged at read time).
CREATE TABLE IF NOT EXISTS seating_picks (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid        NOT NULL REFERENCES seating_plans(id) ON DELETE CASCADE,
  from_person_id uuid        NOT NULL REFERENCES seating_people(id) ON DELETE CASCADE,
  to_person_id   uuid        NOT NULL REFERENCES seating_people(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, from_person_id, to_person_id)
);

-- "Who does your kid want to sit by?" answers collected on an event's signup
-- form (when events.collect_sit_by is on). Player-level, not plan-level, so one
-- answer serves every plan linked to that event. parent_id records who answered.
-- Parent writes happen via the service client in code; see RLS below.
CREATE TABLE IF NOT EXISTS event_sit_by_picks (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid        NOT NULL REFERENCES events(id)  ON DELETE CASCADE,
  player_id        uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  picked_player_id uuid        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  parent_id        uuid        REFERENCES parents(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, player_id, picked_player_id)
);
CREATE INDEX IF NOT EXISTS event_sit_by_picks_event ON event_sit_by_picks (event_id);

-- Flag on the event: show the "sit by" question on the signup form. Flipped on
-- automatically when a seating plan links the event.
ALTER TABLE events ADD COLUMN IF NOT EXISTS collect_sit_by boolean NOT NULL DEFAULT false;

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Plans: the owning coach (an authenticated non-parent), or anyone granted the
-- 'seating' tool (shared workspace, like the Roster Creator's grant model).
-- Children check their parent plan's ownership, or the same grant.
ALTER TABLE seating_plans      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_zones      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_seats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_people     ENABLE ROW LEVEL SECURITY;
ALTER TABLE seating_picks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sit_by_picks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner_or_grantee_seating_plans" ON seating_plans;
CREATE POLICY "owner_or_grantee_seating_plans" ON seating_plans
  FOR ALL TO authenticated
  USING      ((user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
              OR public.has_tool_access('seating'))
  WITH CHECK ((user_id = auth.uid() AND NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
              OR public.has_tool_access('seating'));

DROP POLICY IF EXISTS "owner_or_grantee_seating_zones" ON seating_zones;
CREATE POLICY "owner_or_grantee_seating_zones" ON seating_zones
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'))
  WITH CHECK (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'));

DROP POLICY IF EXISTS "owner_or_grantee_seating_seats" ON seating_seats;
CREATE POLICY "owner_or_grantee_seating_seats" ON seating_seats
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'))
  WITH CHECK (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'));

DROP POLICY IF EXISTS "owner_or_grantee_seating_people" ON seating_people;
CREATE POLICY "owner_or_grantee_seating_people" ON seating_people
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'))
  WITH CHECK (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'));

DROP POLICY IF EXISTS "owner_or_grantee_seating_picks" ON seating_picks;
CREATE POLICY "owner_or_grantee_seating_picks" ON seating_picks
  FOR ALL TO authenticated
  USING      (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'))
  WITH CHECK (EXISTS (SELECT 1 FROM seating_plans p WHERE p.id = plan_id AND p.user_id = auth.uid())
              OR public.has_tool_access('seating'));

-- Coach-shaped policy (like event_invites, migration 033): any authenticated
-- non-parent can read/manage. Parents answering the signup form write via the
-- service client in code, so no parent policy is needed.
DROP POLICY IF EXISTS "coach_all_event_sit_by_picks" ON event_sit_by_picks;
CREATE POLICY "coach_all_event_sit_by_picks" ON event_sit_by_picks
  FOR ALL TO authenticated
  USING      (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()))
  WITH CHECK (NOT EXISTS (SELECT 1 FROM parent_auth WHERE auth_user_id = auth.uid()));
