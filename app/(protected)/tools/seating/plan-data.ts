// Server-only data loaders for the Seating tool. Not a "use server" file — these
// are helpers imported by the server pages; RLS scopes everything to the owner
// or a 'seating' grantee, so an unauthorized user simply gets nothing back.

import { createClient } from "@/lib/supabase/server";
import type {
  DerivedStatus,
  PersonKind,
  PersonVM,
  PickVM,
  PlanData,
  PlanListRow,
  SeatVM,
  SeatingEventInfo,
  ZoneKind,
  ZoneVM,
} from "./types";

type PersonRow = {
  id: string;
  kind: string;
  display_name: string;
  player_id: string | null;
  parent_id: string | null;
  source_team_id: string | null;
  manual_status: string | null;
  seat_id: string | null;
  in_sro: boolean;
  locked: boolean;
  created_at: string;
};

type SignupRow = {
  id: string;
  parent_id: string | null;
  name: string;
  attendees: RsvpAttendee[] | null;
  declined: boolean;
  created_at: string;
};

// One attendee entry from event_signups.attendees. player_id is stamped by the
// newer signup flow for player-tier attendees; older rows need name matching.
type RsvpAttendee = {
  tier_id?: string;
  is_player?: boolean;
  name?: string | null;
  status?: string;
  player_id?: string | null;
  attributes?: Record<string, unknown> | null;
};

type SitByRow = {
  id: string;
  player_id: string;
  picked_player_id: string;
};

const nameKey = (n: string | null | undefined) => (n ?? "").trim().toLowerCase();

const attendeePlayerId = (a: RsvpAttendee): string | null =>
  (a.player_id as string | null) ?? ((a.attributes?.player_id as string | undefined) || null);

const attendeesOf = (s: SignupRow): RsvpAttendee[] => s.attendees ?? [];

// ── Plans list (the /tools/seating index) ─────────────────────────────────────

export async function loadPlansList(): Promise<PlanListRow[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("seating_plans")
    .select("id, title, created_at, events(title), seating_people(id, seat_id)")
    .order("created_at", { ascending: false });

  type Row = {
    id: string;
    title: string;
    created_at: string;
    events: { title: string } | { title: string }[] | null;
    seating_people: { id: string; seat_id: string | null }[] | null;
  };
  return ((data ?? []) as Row[]).map((r) => {
    const ev = Array.isArray(r.events) ? r.events[0] ?? null : r.events;
    const people = r.seating_people ?? [];
    return {
      id: r.id,
      title: r.title,
      created_at: r.created_at,
      eventTitle: ev?.title ?? null,
      peopleCount: people.length,
      seatedCount: people.filter((p) => p.seat_id).length,
    };
  });
}

// ── Full plan payload (the editor page) ───────────────────────────────────────

export async function loadPlanData(id: string): Promise<PlanData | null> {
  const supabase = await createClient();

  const { data: plan } = await supabase
    .from("seating_plans")
    .select("id, title, event_id, notes")
    .eq("id", id)
    .maybeSingle();
  if (!plan) return null;

  const [{ data: zoneRows }, { data: seatRows }, { data: personRows }, { data: pickRows }] =
    await Promise.all([
      supabase.from("seating_zones").select("*").eq("plan_id", id).order("position", { ascending: true }),
      supabase.from("seating_seats").select("*").eq("plan_id", id).order("created_at", { ascending: true }),
      supabase.from("seating_people").select("*").eq("plan_id", id).order("created_at", { ascending: true }),
      supabase.from("seating_picks").select("*").eq("plan_id", id).order("created_at", { ascending: true }),
    ]);

  const people = (personRows ?? []) as PersonRow[];
  const planPlayerIds = [...new Set(people.filter((p) => p.player_id).map((p) => p.player_id as string))];
  const directParentIds = [...new Set(people.filter((p) => p.parent_id).map((p) => p.parent_id as string))];

  // ── Relationship context: households + team membership ──────────────────────
  // player_parents rows for (a) the plan's players, (b) every directly linked
  // parent's kids, and (c) the co-parents of those kids — enough to compute each
  // person's household (familyKey) without walking the whole graph.
  const kidParents = new Map<string, Set<string>>(); // player → parents
  const parentKids = new Map<string, Set<string>>(); // parent → players
  const addPP = (playerId: string, parentId: string) => {
    if (!kidParents.has(playerId)) kidParents.set(playerId, new Set());
    kidParents.get(playerId)!.add(parentId);
    if (!parentKids.has(parentId)) parentKids.set(parentId, new Set());
    parentKids.get(parentId)!.add(playerId);
  };

  if (planPlayerIds.length > 0) {
    const { data: pp } = await supabase
      .from("player_parents")
      .select("player_id, parent_id")
      .in("player_id", planPlayerIds);
    for (const r of pp ?? []) addPP(r.player_id as string, r.parent_id as string);
  }
  const allParentIds = [...new Set([...directParentIds, ...parentKids.keys()])];
  if (allParentIds.length > 0) {
    const { data: pp } = await supabase
      .from("player_parents")
      .select("player_id, parent_id")
      .in("parent_id", allParentIds);
    for (const r of pp ?? []) addPP(r.player_id as string, r.parent_id as string);
    // Co-parents of kids we just discovered (kids outside the plan).
    const extraKids = [...new Set((pp ?? []).map((r) => r.player_id as string))].filter(
      (k) => !planPlayerIds.includes(k)
    );
    if (extraKids.length > 0) {
      const { data: co } = await supabase
        .from("player_parents")
        .select("player_id, parent_id")
        .in("player_id", extraKids);
      for (const r of co ?? []) addPP(r.player_id as string, r.parent_id as string);
    }
  }

  // Household of a parent: {self} ∪ co-parents of their kids, sorted.
  const famOf = (parentId: string): string => {
    const fam = new Set<string>([parentId]);
    for (const kid of parentKids.get(parentId) ?? []) {
      for (const p of kidParents.get(kid) ?? []) fam.add(p);
    }
    return [...fam].sort().join("+");
  };

  const familyKeyOf = (p: PersonRow): string | null => {
    if (p.kind === "player" && p.player_id) {
      const parents = kidParents.get(p.player_id);
      if (parents && parents.size > 0) return [...parents].sort().join("+");
      return p.parent_id ? famOf(p.parent_id) : null;
    }
    if (p.kind === "parent") return p.parent_id ? famOf(p.parent_id) : null;
    // Siblings (and synced guests) carry one guardian — use that household.
    return p.parent_id ? famOf(p.parent_id) : null;
  };

  // Active team membership per player (drives auto-assign's team grouping).
  const teamsByPlayer = new Map<string, string[]>();
  if (planPlayerIds.length > 0) {
    const { data: rosterRows } = await supabase
      .from("roster")
      .select("player_id, team_id, status")
      .in("player_id", planPlayerIds);
    for (const r of rosterRows ?? []) {
      if (r.status !== "active") continue;
      const pid = r.player_id as string;
      const arr = teamsByPlayer.get(pid) ?? [];
      if (!arr.includes(r.team_id as string)) arr.push(r.team_id as string);
      teamsByPlayer.set(pid, arr);
    }
  }

  // ── Event context (when linked) ──────────────────────────────────────────────
  let event: SeatingEventInfo | null = null;
  let signups: SignupRow[] = [];
  let sitByRows: SitByRow[] = [];
  const invitedParents = new Set<string>();
  const viewedParents = new Set<string>();

  const eventId = plan.event_id as string | null;
  if (eventId) {
    // select(*) so a live DB that predates the collect_sit_by column still loads.
    const { data: ev } = await supabase.from("events").select("*").eq("id", eventId).maybeSingle();
    if (ev) {
      event = {
        id: ev.id as string,
        title: (ev.title as string) ?? "",
        slug: (ev.slug as string) ?? "",
        status: (ev.status as string) ?? "draft",
        collectSitBy: Boolean((ev as Record<string, unknown>).collect_sit_by ?? false),
        startsAt: (ev.starts_at as string | null) ?? null,
      };
    }
    const [suRes, invRes, vwRes, sitRes] = await Promise.all([
      supabase
        .from("event_signups")
        .select("id, parent_id, name, attendees, declined, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false }),
      supabase.from("event_invites").select("parent_id").eq("event_id", eventId),
      supabase.from("event_views").select("parent_id").eq("event_id", eventId),
      // Tolerate a live DB without the event_sit_by_picks table yet.
      supabase.from("event_sit_by_picks").select("id, player_id, picked_player_id").eq("event_id", eventId),
    ]);
    signups = (suRes.data ?? []) as SignupRow[];
    for (const r of invRes.data ?? []) if (r.parent_id) invitedParents.add(r.parent_id as string);
    for (const r of vwRes.data ?? []) if (r.parent_id) viewedParents.add(r.parent_id as string);
    sitByRows = sitRes.error ? [] : ((sitRes.data ?? []) as SitByRow[]);
  }

  // Signups per parent, newest first (the source array is already sorted desc).
  const signupsByParent = new Map<string, SignupRow[]>();
  for (const s of signups) {
    if (!s.parent_id) continue;
    const arr = signupsByParent.get(s.parent_id) ?? [];
    arr.push(s);
    signupsByParent.set(s.parent_id, arr);
  }

  // ── Per-person status derivation ─────────────────────────────────────────────
  const MANUAL: DerivedStatus[] = ["planning", "invited", "opened", "no", "yes"];
  const derive = (
    p: PersonRow,
    familyKey: string | null
  ): { status: DerivedStatus; statusSource: PersonVM["statusSource"]; rsvpNote: string | null } => {
    // An admin override always wins.
    if (p.manual_status && (MANUAL as string[]).includes(p.manual_status)) {
      return { status: p.manual_status as DerivedStatus, statusSource: "manual", rsvpNote: null };
    }
    if (!event) return { status: "planning", statusSource: "none", rsvpNote: null };

    const famIds = familyKey ? familyKey.split("+") : p.parent_id ? [p.parent_id] : [];
    const famSignups = famIds
      .flatMap((pid) => signupsByParent.get(pid) ?? [])
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    if (famSignups.length > 0) {
      // Find this person among the family's attendees (newest signup wins).
      let found: { declined: boolean } | null = null;
      if (p.kind === "player" && p.player_id) {
        outer: for (const s of famSignups) {
          for (const a of attendeesOf(s)) {
            if (attendeePlayerId(a) === p.player_id) {
              found = { declined: s.declined || a.status === "declined" };
              break outer;
            }
          }
        }
      }
      if (!found) {
        const key = nameKey(p.display_name);
        outer: for (const s of famSignups) {
          for (const a of attendeesOf(s)) {
            if (key && nameKey(a.name) === key) {
              found = { declined: s.declined || a.status === "declined" };
              break outer;
            }
          }
        }
      }
      if (found) {
        return { status: found.declined ? "no" : "yes", statusSource: "event", rsvpNote: null };
      }
      // Parents usually aren't listed as attendees — a family RSVP speaks for them.
      if (p.kind === "parent") {
        return {
          status: famSignups[0].declined ? "no" : "yes",
          statusSource: "event",
          rsvpNote: null,
        };
      }
      // The family responded but this person couldn't be matched to an attendee.
      return famSignups[0].declined
        ? { status: "no", statusSource: "event", rsvpNote: null }
        : {
            status: "opened",
            statusSource: "event",
            rsvpNote: "RSVP'd — couldn't match automatically",
          };
    }

    if (famIds.some((pid) => viewedParents.has(pid)))
      return { status: "opened", statusSource: "event", rsvpNote: null };
    if (famIds.some((pid) => invitedParents.has(pid)))
      return { status: "invited", statusSource: "event", rsvpNote: null };
    return { status: "planning", statusSource: "event", rsvpNote: null };
  };

  const peopleVMs: PersonVM[] = people.map((p) => {
    const familyKey = familyKeyOf(p);
    const d = derive(p, familyKey);
    return {
      id: p.id,
      kind: p.kind as PersonKind,
      displayName: p.display_name,
      playerId: p.player_id,
      parentId: p.parent_id,
      sourceTeamId: p.source_team_id,
      manualStatus:
        p.manual_status && (MANUAL as string[]).includes(p.manual_status)
          ? (p.manual_status as DerivedStatus)
          : null,
      seatId: p.seat_id,
      inSro: p.in_sro,
      locked: p.locked,
      status: d.status,
      statusSource: d.statusSource,
      familyKey,
      teamIds: p.player_id ? teamsByPlayer.get(p.player_id) ?? [] : [],
      rsvpNote: d.rsvpNote,
    };
  });

  // ── Picks: event-collected (player-level, mapped to people) + admin edges ───
  const personByPlayerId = new Map<string, string>();
  for (const p of people) {
    if (p.player_id && !personByPlayerId.has(p.player_id)) personByPlayerId.set(p.player_id, p.id);
  }
  const merged = new Map<string, PickVM>();
  for (const r of sitByRows) {
    const from = personByPlayerId.get(r.player_id);
    const to = personByPlayerId.get(r.picked_player_id);
    if (!from || !to || from === to) continue; // drop picks we can't map
    merged.set(`${from}->${to}`, { id: r.id, fromPersonId: from, toPersonId: to, source: "event" });
  }
  for (const r of (pickRows ?? []) as { id: string; from_person_id: string; to_person_id: string }[]) {
    // Same edge from both sources: the admin row wins (it's the deletable one).
    merged.set(`${r.from_person_id}->${r.to_person_id}`, {
      id: r.id,
      fromPersonId: r.from_person_id,
      toPersonId: r.to_person_id,
      source: "admin",
    });
  }

  // ── RSVP'd attendees nobody in the plan matches (badge on "Pull from RSVPs") ─
  const personNames = new Set(people.map((p) => nameKey(p.display_name)));
  const personPlayerIds = new Set(planPlayerIds);
  let unmatchedRsvpCount = 0;
  for (const s of signups) {
    if (s.declined) continue;
    for (const a of attendeesOf(s)) {
      if (a.status === "declined") continue;
      const pid = attendeePlayerId(a);
      const matched = (pid && personPlayerIds.has(pid)) || (a.name && personNames.has(nameKey(a.name)));
      if (!matched) unmatchedRsvpCount++;
    }
  }

  return {
    plan: {
      id: plan.id as string,
      title: plan.title as string,
      eventId,
      notes: (plan.notes as string | null) ?? null,
    },
    zones: ((zoneRows ?? []) as Record<string, unknown>[]).map(
      (z): ZoneVM => ({
        id: z.id as string,
        kind: z.kind as ZoneKind,
        label: (z.label as string) ?? "",
        x: (z.x as number) ?? 0,
        y: (z.y as number) ?? 0,
        rotation: (z.rotation as number) ?? 0,
        w: (z.w as number) ?? 0,
        h: (z.h as number) ?? 0,
        capacity: (z.capacity as number | null) ?? null,
        position: (z.position as number) ?? 0,
      })
    ),
    seats: ((seatRows ?? []) as Record<string, unknown>[]).map(
      (s): SeatVM => ({
        id: s.id as string,
        zoneId: (s.zone_id as string | null) ?? null,
        label: (s.label as string) ?? "",
        x: (s.x as number) ?? 0,
        y: (s.y as number) ?? 0,
        unavailable: !!s.unavailable,
      })
    ),
    people: peopleVMs,
    picks: [...merged.values()],
    event,
    unmatchedRsvpCount,
  };
}
