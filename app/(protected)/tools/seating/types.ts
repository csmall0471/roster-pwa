// Shared shapes for the Seating tool. This file is the contract between the
// server loader (plan-data.ts), the server actions (actions.ts), the map UI
// ([id]/*), and the auto-assign engine (assign.ts) — keep it dependency-free.

export type DerivedStatus = "planning" | "invited" | "opened" | "no" | "yes";
export type PersonKind = "player" | "sibling" | "parent" | "guest";
export type ZoneKind = "cluster" | "sro" | "table" | "bar";

// Display + sort order for the status funnel (events/[id] page idiom).
export const STATUS_RANK: Record<DerivedStatus, number> = {
  planning: 0,
  invited: 1,
  opened: 2,
  no: 3,
  yes: 4,
};

export type ZoneVM = {
  id: string;
  kind: ZoneKind;
  label: string;
  // Virtual-canvas px, top-left anchor; rotation in degrees (UI steps by 45).
  x: number;
  y: number;
  rotation: number;
  // Footprint. Clusters derive their visual size from their seats but persist
  // w/h anyway (set at creation) so the editor can draw selection bounds.
  w: number;
  h: number;
  capacity: number | null; // sro only
  position: number; // stable ordering (BL number) for labels + auto-assign
};

export type SeatVM = {
  id: string;
  zoneId: string | null; // null = loose seat placed directly on the canvas
  label: string; // "BL3-2"
  // Zone-local px (pre-rotation) when zoneId is set; canvas-absolute otherwise.
  x: number;
  y: number;
  unavailable: boolean; // not owned / blocked — never assignable
};

export type PersonVM = {
  id: string;
  kind: PersonKind;
  displayName: string;
  playerId: string | null;
  parentId: string | null; // parents: self; siblings: one guardian (family link)
  sourceTeamId: string | null;
  manualStatus: DerivedStatus | null; // admin override; null = derive from event
  seatId: string | null;
  inSro: boolean;
  locked: boolean; // auto-assign may not move
  // Derived (computed in plan-data.ts):
  status: DerivedStatus;
  statusSource: "manual" | "event" | "none";
  // Same key for everyone in one household (sorted parent-ids joined with "+").
  familyKey: string | null;
  teamIds: string[];
  // Age in years (from players.date_of_birth) for anyone tied to a player
  // record; null for free-text siblings, parents, and guests.
  age: number | null;
  // Set when the family RSVP'd but this person couldn't be matched to an
  // attendee (prompts a manual status fix).
  rsvpNote: string | null;
};

export type PickVM = {
  id: string;
  fromPersonId: string;
  toPersonId: string;
  source: "admin" | "event";
};

export type SeatingEventInfo = {
  id: string;
  title: string;
  slug: string;
  status: string;
  collectSitBy: boolean;
  startsAt: string | null;
};

export type PlanData = {
  plan: { id: string; title: string; eventId: string | null; notes: string | null };
  zones: ZoneVM[];
  seats: SeatVM[];
  people: PersonVM[];
  picks: PickVM[];
  event: SeatingEventInfo | null;
  // Names for every team referenced by the plan's people (id → name), for the
  // sidebar's team labels/grouping/filter.
  teamNames: Record<string, string>;
  // Event attendees that no seating_people row matched — shown as a badge on
  // the "Pull from RSVPs" action.
  unmatchedRsvpCount: number;
};

export type PlanListRow = {
  id: string;
  title: string;
  created_at: string;
  eventTitle: string | null;
  peopleCount: number;
  seatedCount: number;
};

// ── Auto-assign contract (assign.ts implements; SeatingTool calls) ───────────

export type AssignInput = {
  // Assignable seats only: available, not occupied by a locked person. cx/cy
  // are WORLD-coordinate seat centers (layout-seed's seatCenterWorld).
  seats: { id: string; zoneId: string | null; cx: number; cy: number }[];
  // Kids to place (players + siblings, status !== "no", unlocked).
  people: { personId: string; familyKey: string | null; teamIds: string[] }[];
  // Explicit sit-by edges at the person level (event picks mapped + admin picks).
  pickEdges: { from: string; to: string }[];
  // Cluster zone ids in position order (fill preference).
  zoneOrder: string[];
};

export type AssignResult = {
  seatByPerson: Record<string, string>;
  unplaced: string[];
  satisfiedPicks: number;
  totalPicks: number;
};
