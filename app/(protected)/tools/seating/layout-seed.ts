// Virtual-canvas geometry + the seeded Hideaway Lounge layout. Pure module —
// shared by the map UI (hit-testing/rendering), createPlan (seeding), and the
// auto-assign engine (seat adjacency). Keep it free of server/client imports.

import type { SeatVM, ZoneVM } from "./types";

// Fixed virtual canvas (integer px). The viewport pans/zooms over this; seat
// and zone coordinates are stored in these units and never rescale.
export const VIRTUAL_W = 4800;
export const VIRTUAL_H = 2400;
export const SEAT = 60; // seat square, px
export const SEAT_GAP = 12;
export const SNAP = 10; // drag-end snap grid (editor)

const rad = (deg: number) => (deg * Math.PI) / 180;

// World position of a zone-local point: anchor + R(rotation)·local.
export function worldPos(
  zone: { x: number; y: number; rotation: number },
  local: { x: number; y: number }
): { x: number; y: number } {
  const r = rad(zone.rotation);
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return {
    x: zone.x + local.x * cos - local.y * sin,
    y: zone.y + local.x * sin + local.y * cos,
  };
}

// World-coordinate CENTER of a seat (loose seats are canvas-absolute).
export function seatCenterWorld(
  zone: { x: number; y: number; rotation: number } | null,
  seat: { x: number; y: number }
): { cx: number; cy: number } {
  const local = { x: seat.x + SEAT / 2, y: seat.y + SEAT / 2 };
  if (!zone) return { cx: local.x, cy: local.y };
  const w = worldPos(zone, local);
  return { cx: w.x, cy: w.y };
}

// Precompute world centers for every seat, keyed by seat id. Hit-testing is
// nearest-center within a radius (robust under zone rotation; seats are small).
export function seatWorldCenters(
  zones: Pick<ZoneVM, "id" | "x" | "y" | "rotation">[],
  seats: Pick<SeatVM, "id" | "zoneId" | "x" | "y">[]
): Map<string, { cx: number; cy: number; zoneId: string | null }> {
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  const out = new Map<string, { cx: number; cy: number; zoneId: string | null }>();
  for (const s of seats) {
    const z = s.zoneId ? zoneById.get(s.zoneId) ?? null : null;
    const { cx, cy } = seatCenterWorld(z, s);
    out.set(s.id, { cx, cy, zoneId: s.zoneId });
  }
  return out;
}

// Max distance from a seat center that still counts as "dropped on this seat".
export const SEAT_HIT_RADIUS = SEAT * 0.75;

// Point-in-zone test that honors rotation (inverse-rotate the point about the
// zone anchor, then simple bounds check). Used for the SRO drop target.
export function pointInZone(
  zone: { x: number; y: number; rotation: number; w: number; h: number },
  wx: number,
  wy: number
): boolean {
  const r = rad(-zone.rotation);
  const dx = wx - zone.x;
  const dy = wy - zone.y;
  const lx = dx * Math.cos(r) - dy * Math.sin(r);
  const ly = dx * Math.sin(r) + dy * Math.cos(r);
  return lx >= 0 && ly >= 0 && lx <= zone.w && ly <= zone.h;
}

// ── Cluster geometry ─────────────────────────────────────────────────────────
// A bar-ledge section as it exists in the venue: up to two rows of 4 seats
// facing the court over a drink ledge. Ticketmaster labels the rows "1" (front,
// at the ledge) and "3" (back). Within a row, seats run 1→4 right-to-left when
// you stand BEHIND the seats facing the court — with the court at the bottom of
// our canvas that puts Seat 1 leftmost on screen.

const PAD = 12; // inner padding
const STRIP = 26; // label strip height at the top of a cluster
const PITCH = SEAT + SEAT_GAP; // 72
export const LEDGE_H = 12; // the drink ledge drawn along the court edge

export type ClusterShape = "1x4" | "2x2" | "2x4";

// Local seat positions + footprint for a cluster shape. Labels are `R{row}·S{n}`
// (section context comes from the zone label). Row 3 sits at the top (lounge
// side), Row 1 at the bottom against the ledge; a single-row shape is Row 1.
export function clusterSeats(
  shape: ClusterShape
): { w: number; h: number; seats: { x: number; y: number; label: string }[] } {
  const seatX = (s: number) => PAD + (s - 1) * PITCH; // Seat 1 leftmost on screen
  const seats: { x: number; y: number; label: string }[] = [];

  if (shape === "2x2") {
    // Legacy compact square (editor option): rows 3/1, two seats each.
    for (const [row, y] of [
      [3, STRIP],
      [1, STRIP + PITCH],
    ] as const) {
      for (let s = 1; s <= 2; s++) seats.push({ x: seatX(s), y, label: `R${row}·S${s}` });
    }
    return { w: PAD * 2 + 2 * SEAT + SEAT_GAP, h: STRIP + PITCH + SEAT + 6 + LEDGE_H + 8, seats };
  }

  const rows: [number, number][] =
    shape === "2x4"
      ? [
          [3, STRIP],
          [1, STRIP + PITCH],
        ]
      : [[1, STRIP]];
  for (const [row, y] of rows) {
    for (let s = 1; s <= 4; s++) seats.push({ x: seatX(s), y, label: `R${row}·S${s}` });
  }
  const lastRowY = rows[rows.length - 1][1];
  return {
    w: PAD * 2 + 4 * SEAT + 3 * SEAT_GAP, // 300
    h: lastRowY + SEAT + 6 + LEDGE_H + 8,
    seats,
  };
}

// Kept for callers that size by shape without seeding seats.
export const SECTION_W = clusterSeats("2x4").w; // 300
export const SECTION_H = clusterSeats("2x4").h;
export const ROW_W = clusterSeats("1x4").w;
export const ROW_H = clusterSeats("1x4").h;
export const SQUARE_W = clusterSeats("2x2").w;
export const SQUARE_H = clusterSeats("2x2").h;

// ── Seeded layout ─────────────────────────────────────────────────────────────
// The Hideaway Lounge as built, with OWNERSHIP taken from the actual
// Ticketmaster account (am.ticketmaster.com HAR, event 27SN0326): 48 bar-ledge
// seats purchased + 52 standing room. Sections BL1–BL12 physically have two
// rows (Row 1 front / Row 3 back) of 4; BL13–BL15 have a single front row.
// A seat the account doesn't hold is seeded `unavailable` (not purchased —
// toggle it available in the editor after buying more).
//
// Owned rows per section (from the HAR):
//   BL1 BL2 BL3 BL5 → Rows 1 + 3 (8 seats each)
//   BL4             → Row 1 only
//   BL6 BL7 BL8     → Row 3 only
//   BL9–BL15        → none yet
const OWNED_ROWS: Record<string, number[]> = {
  BL1: [1, 3],
  BL2: [1, 3],
  BL3: [1, 3],
  BL4: [1],
  BL5: [1, 3],
  BL6: [3],
  BL7: [3],
  BL8: [3],
};

export type SeedZone = {
  kind: ZoneVM["kind"];
  label: string;
  x: number;
  y: number;
  rotation: number;
  w: number;
  h: number;
  capacity: number | null;
  position: number;
  seats: { x: number; y: number; label: string; unavailable: boolean }[];
};

function section(
  label: string,
  x: number,
  y: number,
  rotation: number,
  shape: ClusterShape,
  position: number
): SeedZone {
  const grid = clusterSeats(shape);
  const owned = new Set(OWNED_ROWS[label] ?? []);
  return {
    kind: "cluster",
    label,
    x,
    y,
    rotation,
    w: grid.w,
    h: grid.h,
    capacity: null,
    position,
    seats: grid.seats.map((s) => ({
      ...s,
      // label is `R{row}·S{n}` — row number is the char after "R".
      unavailable: !owned.has(Number(s.label[1])),
    })),
  };
}

export function buildDefaultLayout(): SeedZone[] {
  const zones: SeedZone[] = [];

  // Court-side wall, horizontal run: BL15 (leftmost) … BL7, ledges facing the
  // court below. BL13–BL15 are single-row sections in the venue.
  for (let k = 0; k < 9; k++) {
    const n = 15 - k;
    const shape: ClusterShape = n >= 13 ? "1x4" : "2x4";
    zones.push(section(`BL${n}`, 200 + k * 320, 1400, 0, shape, n));
  }

  // The 45° wall: BL6 … BL1 climbing up-right, ledges facing the court to the
  // lower-right (local bottom rotates there at 315°).
  for (let k = 0; k < 6; k++) {
    const n = 6 - k;
    zones.push(section(`BL${n}`, 3140 + k * 226, 1380 - k * 226, 315, "2x4", n));
  }

  // Lounge interior (behind the seats): standing room, cocktail tables, and the
  // two bars from the venue — the long back bar and the island bar by the
  // 45° wall. Bars/tables are decorative; SRO is the parents' default home.
  zones.push({
    kind: "sro",
    label: "Standing Room",
    x: 260,
    y: 940,
    rotation: 0,
    w: 1050,
    h: 360,
    capacity: 52,
    position: 100,
    seats: [],
  });

  const tableXs = [1480, 1780, 2080, 2380];
  tableXs.forEach((tx, i) => {
    zones.push({
      kind: "table",
      label: "",
      x: tx,
      y: 1180,
      rotation: 0,
      w: 120,
      h: 120,
      capacity: null,
      position: 200 + i,
      seats: [],
    });
  });

  zones.push({
    kind: "bar",
    label: "BAR",
    x: 2550,
    y: 1020,
    rotation: 0,
    w: 900,
    h: 110,
    capacity: null,
    position: 300,
    seats: [],
  });
  zones.push({
    kind: "bar",
    label: "BAR",
    x: 3420,
    y: 760,
    rotation: 315,
    w: 420,
    h: 110,
    capacity: null,
    position: 301,
    seats: [],
  });

  return zones;
}
