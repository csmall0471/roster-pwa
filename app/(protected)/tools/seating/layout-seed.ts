// Virtual-canvas geometry + the seeded Hideaway Lounge layout. Pure module —
// shared by the map UI (hit-testing/rendering), createPlan (seeding), and the
// auto-assign engine (seat adjacency). Keep it free of server/client imports.

import type { SeatVM, ZoneVM } from "./types";

// Fixed virtual canvas (integer px). The viewport pans/zooms over this; seat
// and zone coordinates are stored in these units and never rescale.
export const VIRTUAL_W = 4600;
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

// ── Seeded layout ─────────────────────────────────────────────────────────────
// Best-effort Hideaway Lounge: a horizontal bar-ledge run (BL15…BL7, 1×4 rows)
// meeting a 45° diagonal run (BL6…BL1, 2×2 clusters) — the geometry Connor's own
// prototype validated — plus one SRO standing zone (cap 52) and four decorative
// lounge tables. 15 clusters × 4 = 60 seats; BL13–BL15 seed `unavailable` so 48
// start available. Everything is editable in the tool; these are just defaults.

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

// Cluster content metrics (label strip above the seats).
const PAD = 12;
const STRIP = 32; // label strip height inside the cluster
const PITCH = SEAT + SEAT_GAP; // 72

function rowSeats(zoneLabel: string, unavailable: boolean) {
  // 1×4 horizontal row.
  return [0, 1, 2, 3].map((i) => ({
    x: PAD + i * PITCH,
    y: STRIP,
    label: `${zoneLabel}-${i + 1}`,
    unavailable,
  }));
}

function squareSeats(zoneLabel: string, unavailable: boolean) {
  // 2×2 square.
  return [0, 1, 2, 3].map((i) => ({
    x: PAD + (i % 2) * PITCH,
    y: STRIP + Math.floor(i / 2) * PITCH,
    label: `${zoneLabel}-${i + 1}`,
    unavailable,
  }));
}

export const ROW_W = PAD * 2 + 4 * SEAT + 3 * SEAT_GAP; // 300
export const ROW_H = STRIP + SEAT + PAD; // 104
export const SQUARE_W = PAD * 2 + 2 * SEAT + SEAT_GAP; // 156
export const SQUARE_H = STRIP + 2 * SEAT + SEAT_GAP + PAD; // 176

export function buildDefaultLayout(): SeedZone[] {
  const zones: SeedZone[] = [];

  // Horizontal wall: BL15 (leftmost) … BL7, 1×4 rows along y=1400.
  for (let k = 0; k < 9; k++) {
    const n = 15 - k;
    const label = `BL${n}`;
    const unavailable = n >= 13; // BL13–BL15 not owned (yet)
    zones.push({
      kind: "cluster",
      label,
      x: 200 + k * 320,
      y: 1400,
      rotation: 0,
      w: ROW_W,
      h: ROW_H,
      capacity: null,
      position: n,
      seats: rowSeats(label, unavailable),
    });
  }

  // Diagonal wall: BL6 … BL1, 2×2 squares climbing up-right at 315°.
  for (let k = 0; k < 6; k++) {
    const n = 6 - k;
    const label = `BL${n}`;
    zones.push({
      kind: "cluster",
      label,
      x: 3140 + k * 226,
      y: 1360 - k * 226,
      rotation: 315,
      w: SQUARE_W,
      h: SQUARE_H,
      capacity: null,
      position: n,
      seats: squareSeats(label, false),
    });
  }

  // Standing room (parents live here by default; capacity-counted, no spots).
  zones.push({
    kind: "sro",
    label: "Standing Room",
    x: 300,
    y: 1650,
    rotation: 0,
    w: 1100,
    h: 500,
    capacity: 52,
    position: 100,
    seats: [],
  });

  // Decorative lounge tables (no drop behavior).
  const tableXs = [700, 1300, 1900, 2500];
  tableXs.forEach((tx, i) => {
    zones.push({
      kind: "table",
      label: "",
      x: tx,
      y: 1000,
      rotation: 0,
      w: 140,
      h: 140,
      capacity: null,
      position: 200 + i,
      seats: [],
    });
  });

  return zones;
}
