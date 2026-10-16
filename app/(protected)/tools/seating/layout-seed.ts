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
// facing the COURT over a drink ledge, with the lounge behind the seat backs.
// On our canvas the court sits in the concave pocket the seat band wraps —
// ABOVE the horizontal run and up-left of the 45° run — so inside a section the
// LEDGE is the TOP edge, Row 1 (front) is the top row, Row 3 behind it, and the
// section label reads along the bottom (lounge side).
// Seat numbers: Ticketmaster runs 1→4 right-to-left when you stand BEHIND the
// seats (in the lounge) facing the court. Standing below a section looking up
// (north), your right hand points east — so Seat 1 is the RIGHTMOST on screen.

const PAD = 12; // inner padding
const STRIP = 26; // label strip height at the BOTTOM of a cluster (lounge side)
const PITCH = SEAT + SEAT_GAP; // 72
export const LEDGE_H = 12; // the drink ledge drawn along the court (top) edge
const LEDGE_BAND = 8 + LEDGE_H + 6; // 26 — ledge + breathing room above Row 1

export type ClusterShape = "1x4" | "2x2" | "2x4";

// Local seat positions + footprint for a cluster shape. Labels are `R{row}·S{n}`
// (section context comes from the zone label).
export function clusterSeats(
  shape: ClusterShape
): { w: number; h: number; seats: { x: number; y: number; label: string }[] } {
  const perRow = shape === "2x2" ? 2 : 4;
  const seatX = (s: number) => PAD + (perRow - s) * PITCH; // Seat 1 rightmost
  const rows: [number, number][] =
    shape === "1x4"
      ? [[1, LEDGE_BAND]]
      : [
          [1, LEDGE_BAND], // front row, at the ledge
          [3, LEDGE_BAND + PITCH], // back row
        ];

  const seats: { x: number; y: number; label: string }[] = [];
  for (const [row, y] of rows) {
    for (let s = 1; s <= perRow; s++) seats.push({ x: seatX(s), y, label: `R${row}·S${s}` });
  }
  const lastRowY = rows[rows.length - 1][1];
  return {
    w: PAD * 2 + perRow * SEAT + (perRow - 1) * SEAT_GAP, // 2x4/1x4 → 300
    h: lastRowY + SEAT + STRIP,
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

  // The seat band wraps a corner of the bowl: the COURT fills the concave
  // pocket (above the horizontal run, up-left of the 45° run) and the LOUNGE
  // interior sits behind the seat backs (below / lower-right).

  // Flat run: BL15 (leftmost) … BL6, ledges facing the court ABOVE. BL6 sits on
  // the flat side next to BL7 (per the venue map — only BL1–BL5 are on the 45°
  // wall). BL13–BL15 are single-row sections in the venue.
  for (let k = 0; k < 10; k++) {
    const n = 15 - k;
    const shape: ClusterShape = n >= 13 ? "1x4" : "2x4";
    zones.push(section(`BL${n}`, 200 + k * 320, 1480, 0, shape, n));
  }

  // The 45° wall: BL5 … BL1 climbing up-right, ledges facing the court to the
  // upper-left (the local top rotates there at 315°).
  for (let k = 0; k < 5; k++) {
    const n = 5 - k;
    zones.push(section(`BL${n}`, 3520 + k * 226, 1460 - k * 226, 315, "2x4", n));
  }

  // Lounge interior (BEHIND the seats), arranged like the venue renders:
  // a walkway right behind the ledges with small two-seat high-top nooks in the
  // gaps between sections (the NL spots), then the two long bar ISLANDS along
  // the straight segment, and in the corner the main rectangular BAR with
  // armchair groups (four tub chairs around a round table) scattered on the
  // floor. Bars/tables are decorative; SRO is the parents' default home.

  // Standing room — the open lounge floor at the far end.
  zones.push({
    kind: "sro",
    label: "Standing Room",
    x: 240,
    y: 1840,
    rotation: 0,
    w: 640,
    h: 420,
    capacity: 52,
    position: 100,
    seats: [],
  });

  let tablePos = 200;
  const table = (x: number, y: number, size: number) => {
    zones.push({
      kind: "table",
      label: "",
      x,
      y,
      rotation: 0,
      w: size,
      h: size,
      capacity: null,
      position: tablePos++,
      seats: [],
    });
  };

  // High-top nooks in the gaps between the flat-run sections (NL spots).
  for (let k = 0; k < 9; k++) table(474 + k * 320, 1700, 76);

  // Armchair groups on the corner lounge floor (by the 45° wall).
  table(3080, 1940, 170);
  table(3290, 2080, 170);
  table(3520, 1820, 170);
  table(3770, 2010, 170);

  // The two long bar islands along the straight segment…
  zones.push({
    kind: "bar",
    label: "BAR",
    x: 1000,
    y: 1920,
    rotation: 0,
    w: 620,
    h: 130,
    capacity: null,
    position: 300,
    seats: [],
  });
  zones.push({
    kind: "bar",
    label: "BAR",
    x: 1950,
    y: 1920,
    rotation: 0,
    w: 620,
    h: 130,
    capacity: null,
    position: 301,
    seats: [],
  });
  // …and the main corner bar, squared to the 45° wall.
  zones.push({
    kind: "bar",
    label: "BAR",
    x: 3650,
    y: 1640,
    rotation: 315,
    w: 520,
    h: 170,
    capacity: null,
    position: 302,
    seats: [],
  });

  return zones;
}
