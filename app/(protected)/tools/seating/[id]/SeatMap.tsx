"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PersonVM, SeatVM, ZoneVM } from "../types";
import {
  VIRTUAL_W,
  VIRTUAL_H,
  SEAT,
  SNAP,
  SEAT_HIT_RADIUS,
  seatWorldCenters,
  pointInZone,
  worldPos,
} from "../layout-seed";
import ZoneNode from "./ZoneNode";
import SeatNode from "./SeatNode";
import PersonChip from "./PersonChip";

// Imperative surface SeatingTool hands to the Toolbar ("+ Add" at center, zoom
// buttons) and the PeoplePanel (sidebar rows are drag sources onto this map).
export type SeatMapApi = {
  chipPointerDown: (person: PersonVM, e: React.PointerEvent) => void;
  getCenterWorld: () => { x: number; y: number };
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
};

type Mode = "assign" | "edit";

type Props = {
  mode: Mode;
  zones: ZoneVM[];
  seats: SeatVM[];
  people: PersonVM[];
  occupantBySeat: Map<string, PersonVM>;
  selectedPersonId: string | null;
  selectedZoneId: string | null;
  selectedSeatId: string | null;
  apiRef: React.MutableRefObject<SeatMapApi | null>;
  onSelectPerson: (id: string | null) => void;
  onSelectZone: (id: string | null) => void;
  onSelectSeat: (id: string | null) => void;
  // Assign mode
  onAssign: (personId: string, seatId: string) => void;
  onSwap: (personAId: string, personBId: string) => void;
  onSro: (personId: string) => void;
  // Edit mode — preview = local-only while dragging; commit = server action
  onZonePreview: (zoneId: string, x: number, y: number) => void;
  onZoneCommit: (zoneId: string, x: number, y: number, origX: number, origY: number) => void;
  onSeatPreview: (seatId: string, x: number, y: number) => void;
  onSeatCommit: (seatId: string, x: number, y: number, origX: number, origY: number) => void;
  onRotateZone: (zone: ZoneVM) => void;
  onRenameZone: (zone: ZoneVM) => void;
  onZoneCapacity: (zone: ZoneVM) => void;
  onDeleteZone: (zone: ZoneVM) => void;
  onToggleSeatAvailable: (seat: SeatVM) => void;
  onRelabelSeat: (seat: SeatVM) => void;
  onDeleteSeat: (seat: SeatVM) => void;
};

type Gesture =
  | { type: "pan"; pointerId: number; vx0: number; vy0: number; px: number; py: number; startX: number; startY: number; moved: boolean }
  | { type: "pinch"; s0: number; vx0: number; vy0: number; dist0: number; mx0: number; my0: number }
  | { type: "chip"; pointerId: number; person: PersonVM; startX: number; startY: number; moved: boolean }
  | { type: "zone"; pointerId: number; zone: ZoneVM; startX: number; startY: number; origX: number; origY: number; moved: boolean }
  | { type: "seat"; pointerId: number; seat: SeatVM; zone: ZoneVM | null; startX: number; startY: number; origX: number; origY: number; moved: boolean };

const INITIAL_VIEW = { vx: 40, vy: 40, s: 0.3 };
const clampS = (v: number) => Math.min(3, Math.max(0.15, v));
// Stable empties so memo(ZoneNode) isn't defeated by fresh [] identities.
const NO_SEATS: SeatVM[] = [];
const NO_PEOPLE: PersonVM[] = [];
const snap = (v: number) => Math.round(v / SNAP) * SNAP;
const DRAG_PX = 6;

// Faint layout grid, visible on both themes (slate @ low alpha).
const GRID_BG =
  "repeating-linear-gradient(0deg, rgba(100,116,139,0.10) 0 1px, transparent 1px 100px)," +
  "repeating-linear-gradient(90deg, rgba(100,116,139,0.10) 0 1px, transparent 1px 100px)";

export default function SeatMap({
  mode,
  zones,
  seats,
  people,
  occupantBySeat,
  selectedPersonId,
  selectedZoneId,
  selectedSeatId,
  apiRef,
  onSelectPerson,
  onSelectZone,
  onSelectSeat,
  onAssign,
  onSwap,
  onSro,
  onZonePreview,
  onZoneCommit,
  onSeatPreview,
  onSeatCommit,
  onRotateZone,
  onRenameZone,
  onZoneCapacity,
  onDeleteZone,
  onToggleSeatAvailable,
  onRelabelSeat,
  onDeleteSeat,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Viewport lives in a ref (mutated by gestures), mirrored to state through a
  // requestAnimationFrame throttle for rendering.
  const view = useRef({ ...INITIAL_VIEW });
  const [viewState, setViewState] = useState(INITIAL_VIEW);
  const raf = useRef(0);
  const pushView = useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      setViewState({ ...view.current });
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState<{ person: PersonVM; x: number; y: number } | null>(null);

  // Fresh copies for callbacks that live outside the render cycle (fit on
  // resize, the native wheel listener).
  const zonesRef = useRef(zones);
  const seatsRef = useRef(seats);
  useEffect(() => {
    zonesRef.current = zones;
    seatsRef.current = seats;
  }, [zones, seats]);

  const centers = useMemo(() => seatWorldCenters(zones, seats), [zones, seats]);
  const seatsByZone = useMemo(() => {
    const m = new Map<string, SeatVM[]>();
    for (const s of seats) {
      if (!s.zoneId) continue;
      const arr = m.get(s.zoneId);
      if (arr) arr.push(s);
      else m.set(s.zoneId, [s]);
    }
    return m;
  }, [seats]);
  const looseSeats = useMemo(() => seats.filter((s) => !s.zoneId), [seats]);
  const sroZone = useMemo(() => zones.find((z) => z.kind === "sro") ?? null, [zones]);
  const sroPeople = useMemo(() => people.filter((p) => p.inSro), [people]);
  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);

  // Empty, available seats pulse when a person is selected (tap-assign targets).
  const eligibleSeatIds = useMemo(() => {
    if (mode !== "assign" || !selectedPersonId) return new Set<string>();
    return new Set(
      seats.filter((s) => !s.unavailable && !occupantBySeat.has(s.id)).map((s) => s.id)
    );
  }, [mode, selectedPersonId, seats, occupantBySeat]);

  const zoomedOut = viewState.s < 0.7;

  // ── Viewport: fit / zoom / conversions ─────────────────────────────────────

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const cw = el.clientWidth;
    const ch = el.clientHeight;
    if (cw < 10 || ch < 10) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const push = (x: number, y: number) => {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    };
    for (const z of zonesRef.current) {
      for (const [lx, ly] of [[0, 0], [z.w, 0], [0, z.h], [z.w, z.h]] as const) {
        const p = worldPos(z, { x: lx, y: ly });
        push(p.x, p.y);
      }
    }
    for (const s of seatsRef.current) {
      if (s.zoneId) continue;
      push(s.x, s.y);
      push(s.x + SEAT, s.y + SEAT);
    }
    if (!Number.isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = VIRTUAL_W;
      maxY = VIRTUAL_H;
    }
    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);
    const s = clampS(Math.min((cw - 80) / bw, (ch - 80) / bh));
    view.current = {
      s,
      vx: (cw - bw * s) / 2 - minX * s,
      vy: (ch - bh * s) / 2 - minY * s,
    };
    pushView();
  }, [pushView]);

  // Initial mount + container resizes → fit (ResizeObserver fires on observe).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const zoomBy = useCallback(
    (k: number) => {
      const el = containerRef.current;
      if (!el) return;
      const cx = el.clientWidth / 2;
      const cy = el.clientHeight / 2;
      const v = view.current;
      const s2 = clampS(v.s * k);
      view.current = {
        s: s2,
        vx: cx - (cx - v.vx) * (s2 / v.s),
        vy: cy - (cy - v.vy) * (s2 / v.s),
      };
      pushView();
    },
    [pushView]
  );

  // React's onWheel is passive — attach a native non-passive listener so we can
  // preventDefault and do cursor-anchored zoom.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const v = view.current;
      const k = e.deltaY > 0 ? 0.9 : 1.1;
      const s2 = clampS(v.s * k);
      view.current = {
        s: s2,
        vx: cx - (cx - v.vx) * (s2 / v.s),
        vy: cy - (cy - v.vy) * (s2 / v.s),
      };
      pushView();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [pushView]);

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const v = view.current;
    return { x: (clientX - rect.left - v.vx) / v.s, y: (clientY - rect.top - v.vy) / v.s };
  }, []);

  const getCenterWorld = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { x: VIRTUAL_W / 2, y: VIRTUAL_H / 2 };
    const rect = el.getBoundingClientRect();
    return clientToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }, [clientToWorld]);

  // ── Hit-testing ─────────────────────────────────────────────────────────────

  function nearestSeat(wx: number, wy: number): SeatVM | null {
    let best: SeatVM | null = null;
    let bestD = SEAT_HIT_RADIUS;
    for (const s of seats) {
      if (s.unavailable) continue;
      const c = centers.get(s.id);
      if (!c) continue;
      const d = Math.hypot(c.cx - wx, c.cy - wy);
      if (d <= bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  function hitZone(wx: number, wy: number): ZoneVM | null {
    // Clusters/tables sit above the SRO zone, so test them first.
    for (let i = zones.length - 1; i >= 0; i--) {
      const z = zones[i];
      if (z.kind !== "sro" && pointInZone(z, wx, wy)) return z;
    }
    for (const z of zones) if (z.kind === "sro" && pointInZone(z, wx, wy)) return z;
    return null;
  }

  // ── Gesture starts from children (they stopPropagation) ────────────────────

  const beginGesture = useCallback((e: React.PointerEvent, g: Gesture) => {
    const el = containerRef.current;
    if (!el || gesture.current) return false;
    e.stopPropagation();
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // pointer may already be gone (fast taps) — gesture still works via bubbling
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    gesture.current = g;
    return true;
  }, []);

  const chipPointerDown = useCallback(
    (person: PersonVM, e: React.PointerEvent) => {
      beginGesture(e, {
        type: "chip",
        pointerId: e.pointerId,
        person,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      });
    },
    [beginGesture]
  );

  const zonePointerDown = useCallback(
    (zone: ZoneVM, e: React.PointerEvent) => {
      beginGesture(e, {
        type: "zone",
        pointerId: e.pointerId,
        zone,
        startX: e.clientX,
        startY: e.clientY,
        origX: zone.x,
        origY: zone.y,
        moved: false,
      });
    },
    [beginGesture]
  );

  const seatPointerDown = useCallback(
    (seat: SeatVM, e: React.PointerEvent) => {
      beginGesture(e, {
        type: "seat",
        pointerId: e.pointerId,
        seat,
        zone: seat.zoneId ? zoneById.get(seat.zoneId) ?? null : null,
        startX: e.clientX,
        startY: e.clientY,
        origX: seat.x,
        origY: seat.y,
        moved: false,
      });
    },
    [beginGesture, zoneById]
  );

  // Expose the imperative API every render so closures stay fresh.
  useEffect(() => {
    apiRef.current = {
      chipPointerDown,
      getCenterWorld,
      zoomIn: () => zoomBy(1.2),
      zoomOut: () => zoomBy(1 / 1.2),
      fit,
    };
  });
  useEffect(() => {
    const ref = apiRef;
    return () => {
      ref.current = null;
    };
  }, [apiRef]);

  // ── Container pointer handlers (pan / pinch / drag resolution) ─────────────

  function onPointerDown(e: React.PointerEvent) {
    const el = containerRef.current;
    if (!el) return;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && (!g || g.type === "pan")) {
      // Second finger down over empty canvas → pinch (upgrade from pan).
      const [a, b] = pts;
      const rect = el.getBoundingClientRect();
      gesture.current = {
        type: "pinch",
        s0: view.current.s,
        vx0: view.current.vx,
        vy0: view.current.vy,
        dist0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        mx0: (a.x + b.x) / 2 - rect.left,
        my0: (a.y + b.y) / 2 - rect.top,
      };
    } else if (!g && pts.length === 1) {
      gesture.current = {
        type: "pan",
        pointerId: e.pointerId,
        vx0: view.current.vx,
        vy0: view.current.vy,
        px: e.clientX,
        py: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
      };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch") {
      const pts = [...pointers.current.values()];
      if (pts.length < 2) return;
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const [a, b] = pts;
      const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const s2 = clampS(g.s0 * (dist / g.dist0));
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      // Same anchor math as wheel (anchored at the start midpoint), plus the
      // midpoint's own travel pans the canvas.
      view.current = {
        s: s2,
        vx: g.mx0 - (g.mx0 - g.vx0) * (s2 / g.s0) + (mx - g.mx0),
        vy: g.my0 - (g.my0 - g.vy0) * (s2 / g.s0) + (my - g.my0),
      };
      pushView();
      return;
    }

    if (e.pointerId !== g.pointerId) return;
    const moved = Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > DRAG_PX;

    if (g.type === "pan") {
      if (moved) g.moved = true;
      view.current = {
        ...view.current,
        vx: g.vx0 + (e.clientX - g.px),
        vy: g.vy0 + (e.clientY - g.py),
      };
      pushView();
      return;
    }

    if (g.type === "chip") {
      if (moved) g.moved = true;
      if (g.moved) setDragging({ person: g.person, x: e.clientX, y: e.clientY });
      return;
    }

    const s = view.current.s;
    const wdx = (e.clientX - g.startX) / s;
    const wdy = (e.clientY - g.startY) / s;

    if (g.type === "zone") {
      if (moved) g.moved = true;
      if (g.moved) onZonePreview(g.zone.id, g.origX + wdx, g.origY + wdy);
      return;
    }

    if (g.type === "seat") {
      if (moved) g.moved = true;
      if (!g.moved) return;
      // Seats in a zone live in zone-local coords: inverse-rotate the world
      // delta by the zone's rotation. Loose seats move in absolute coords.
      const rot = g.zone?.rotation ?? 0;
      const r = (-rot * Math.PI) / 180;
      const ldx = wdx * Math.cos(r) - wdy * Math.sin(r);
      const ldy = wdx * Math.sin(r) + wdy * Math.cos(r);
      onSeatPreview(g.seat.id, g.origX + ldx, g.origY + ldy);
    }
  }

  function handleChipDrop(person: PersonVM, clientX: number, clientY: number) {
    const { x: wx, y: wy } = clientToWorld(clientX, clientY);
    const seat = nearestSeat(wx, wy);
    if (seat) {
      const occ = occupantBySeat.get(seat.id);
      if (!occ) onAssign(person.id, seat.id);
      else if (occ.id !== person.id) onSwap(person.id, occ.id);
      return;
    }
    if (sroZone && pointInZone(sroZone, wx, wy)) {
      if (!person.inSro) onSro(person.id);
      return;
    }
    // Dropped on nothing → revert (no-op).
  }

  function handleCanvasTap(clientX: number, clientY: number) {
    const { x: wx, y: wy } = clientToWorld(clientX, clientY);
    if (mode === "edit") {
      const z = hitZone(wx, wy);
      onSelectZone(z ? z.id : null);
      onSelectSeat(null);
      return;
    }
    const seat = nearestSeat(wx, wy);
    if (seat) {
      const occ = occupantBySeat.get(seat.id);
      if (selectedPersonId && !occ) {
        onAssign(selectedPersonId, seat.id);
        onSelectPerson(null);
      } else if (occ) {
        onSelectPerson(occ.id === selectedPersonId ? null : occ.id);
      }
      return;
    }
    if (sroZone && selectedPersonId && pointInZone(sroZone, wx, wy)) {
      onSro(selectedPersonId);
      onSelectPerson(null);
      return;
    }
    onSelectPerson(null); // tap on empty canvas clears selection
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pinch") {
      // Drop back to a pan with the remaining finger.
      const rest = [...pointers.current.entries()];
      if (rest.length >= 1) {
        const [pid, p] = rest[0];
        gesture.current = {
          type: "pan",
          pointerId: pid,
          vx0: view.current.vx,
          vy0: view.current.vy,
          px: p.x,
          py: p.y,
          startX: p.x,
          startY: p.y,
          moved: true,
        };
      } else {
        gesture.current = null;
      }
      return;
    }

    if (e.pointerId !== g.pointerId) return; // a stray second finger lifted
    gesture.current = null;

    if (g.type === "pan") {
      if (!g.moved) handleCanvasTap(e.clientX, e.clientY);
      return;
    }

    if (g.type === "chip") {
      setDragging(null);
      if (!g.moved) {
        onSelectPerson(g.person.id === selectedPersonId ? null : g.person.id);
        return;
      }
      handleChipDrop(g.person, e.clientX, e.clientY);
      return;
    }

    const s = view.current.s;
    const wdx = (e.clientX - g.startX) / s;
    const wdy = (e.clientY - g.startY) / s;

    if (g.type === "zone") {
      if (!g.moved) {
        onSelectZone(g.zone.id === selectedZoneId ? null : g.zone.id);
        onSelectSeat(null);
        return;
      }
      onZoneCommit(g.zone.id, snap(g.origX + wdx), snap(g.origY + wdy), g.origX, g.origY);
      return;
    }

    if (g.type === "seat") {
      if (!g.moved) {
        onSelectSeat(g.seat.id === selectedSeatId ? null : g.seat.id);
        onSelectZone(null);
        return;
      }
      const rot = g.zone?.rotation ?? 0;
      const r = (-rot * Math.PI) / 180;
      const ldx = wdx * Math.cos(r) - wdy * Math.sin(r);
      const ldy = wdx * Math.sin(r) + wdy * Math.cos(r);
      onSeatCommit(g.seat.id, snap(g.origX + ldx), snap(g.origY + ldy), g.origX, g.origY);
    }
  }

  function onPointerCancel(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (!g) return;
    if (g.type === "pinch") {
      gesture.current = null;
      return;
    }
    if (e.pointerId !== g.pointerId) return;
    // Abort: put previews back where they started.
    if (g.type === "zone" && g.moved) onZonePreview(g.zone.id, g.origX, g.origY);
    if (g.type === "seat" && g.moved) onSeatPreview(g.seat.id, g.origX, g.origY);
    if (g.type === "chip") setDragging(null);
    gesture.current = null;
  }

  // ── Mini-toolbars (edit mode) ───────────────────────────────────────────────

  const selZone = mode === "edit" && selectedZoneId ? zoneById.get(selectedZoneId) ?? null : null;
  const selSeat =
    mode === "edit" && selectedSeatId ? seats.find((s) => s.id === selectedSeatId) ?? null : null;

  const miniBtn =
    "rounded-md px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700";

  function miniBarAt(wx: number, wy: number): React.CSSProperties {
    return {
      left: Math.max(4, viewState.vx + wx * viewState.s),
      top: Math.max(4, viewState.vy + wy * viewState.s - 42),
      position: "absolute",
    };
  }

  const selSeatCenter = selSeat ? centers.get(selSeat.id) : null;

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        className="relative overflow-hidden rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-950 select-none"
        style={{ touchAction: "none", height: "calc(100dvh - 240px)", minHeight: 420 }}
      >
        <div
          data-zoom={zoomedOut ? "out" : "in"}
          className="bg-stone-100 dark:bg-gray-900/60"
          style={{
            width: VIRTUAL_W,
            height: VIRTUAL_H,
            transform: `translate(${viewState.vx}px, ${viewState.vy}px) scale(${viewState.s})`,
            transformOrigin: "0 0",
            position: "absolute",
            backgroundImage: GRID_BG,
          }}
        >
          {/* Static venue ambience, under everything. The seat band wraps a
              corner of the arena bowl: the COURT fills the concave pocket the
              seats face (above the horizontal run, up-left of the 45° run) and
              the lounge floor is behind the seat backs. Pure decoration — not
              stored, not interactive. */}
          {/* Arena bowl, with a band hugging the 45° wall so it wraps the corner. */}
          <div
            className="pointer-events-none absolute rounded-[48px] bg-gradient-to-b from-gray-400/60 to-gray-600/70 dark:from-gray-950 dark:to-black"
            style={{ left: 300, top: 150, width: 2600, height: 1200 }}
          />
          <div
            className="pointer-events-none absolute rounded-[48px] bg-gradient-to-b from-gray-400/60 to-gray-600/70 dark:from-gray-950 dark:to-black"
            style={{
              left: 2640,
              top: 1140,
              width: 1500,
              height: 420,
              transform: "rotate(315deg)",
              transformOrigin: "top left",
            }}
          />
          {/* Hardwood court — PORTRAIT from here: the lounge looks on from
              behind the baseline/corner (sections 117–122 side), so the court's
              long axis runs away from the viewer. Midline + center circle. */}
          <div
            className="pointer-events-none absolute rounded-lg bg-gradient-to-b from-amber-200 to-amber-400 dark:from-amber-900 dark:to-amber-950 shadow-inner"
            style={{ left: 1320, top: 290, width: 620, height: 1000 }}
          >
            <div className="absolute left-0 top-1/2 h-0.5 w-full -translate-y-1/2 bg-amber-700/50 dark:bg-amber-500/30" />
            <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-amber-700/50 dark:border-amber-500/30" />
            {/* Keys at each end. */}
            <div className="absolute left-1/2 top-0 h-28 w-40 -translate-x-1/2 rounded-b-md border-2 border-t-0 border-amber-700/40 dark:border-amber-500/25" />
            <div className="absolute bottom-0 left-1/2 h-28 w-40 -translate-x-1/2 rounded-t-md border-2 border-b-0 border-amber-700/40 dark:border-amber-500/25" />
            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[16px] font-bold uppercase tracking-[0.5em] text-amber-800/50 dark:text-amber-400/30 pl-[0.5em]">
              Court
            </span>
          </div>

          {/* Lounge floor slabs behind the seat backs (straight segment + the
              corner floor squared to the 45° wall), so the lounge reads as its
              own room. */}
          <div
            className="pointer-events-none absolute rounded-3xl bg-stone-200/80 dark:bg-stone-900/50"
            style={{ left: 160, top: 1680, width: 3140, height: 650 }}
          />
          <div
            className="pointer-events-none absolute rounded-3xl bg-stone-200/80 dark:bg-stone-900/50"
            style={{
              left: 3260,
              top: 1760,
              width: 1500,
              height: 560,
              transform: "rotate(315deg)",
              transformOrigin: "top left",
            }}
          />
          {/* Lounge floor lettering, behind the seat backs. */}
          <span
            className="pointer-events-none absolute text-[30px] font-bold uppercase tracking-[0.7em] text-stone-500/70 dark:text-stone-500/60"
            style={{ left: 1100, top: 2180 }}
          >
            Hideaway Lounge
          </span>

          {/* SRO at the bottom of the stack, then bars/tables, then seat clusters. */}
          {(["sro", "bar", "table", "cluster"] as const).map((kind) =>
            zones
              .filter((z) => z.kind === kind)
              .map((z) => (
                <ZoneNode
                  key={z.id}
                  zone={z}
                  seats={seatsByZone.get(z.id) ?? NO_SEATS}
                  occupantBySeat={occupantBySeat}
                  sroPeople={z.kind === "sro" ? sroPeople : NO_PEOPLE}
                  mode={mode}
                  zoomedOut={zoomedOut}
                  selected={z.id === selectedZoneId}
                  selectedPersonId={selectedPersonId}
                  selectedSeatId={selectedSeatId}
                  eligibleSeatIds={eligibleSeatIds}
                  onZonePointerDown={mode === "edit" ? zonePointerDown : undefined}
                  onSeatPointerDown={mode === "edit" ? seatPointerDown : undefined}
                  onChipPointerDown={mode === "assign" ? chipPointerDown : undefined}
                />
              ))
          )}

          {/* Loose seats placed directly on the canvas. */}
          {looseSeats.map((s) => {
            const occ = occupantBySeat.get(s.id) ?? null;
            const down =
              mode === "edit"
                ? (e: React.PointerEvent) => seatPointerDown(s, e)
                : occ
                  ? (e: React.PointerEvent) => chipPointerDown(occ, e)
                  : undefined;
            return (
              <SeatNode
                key={s.id}
                seat={s}
                occupant={occ}
                zoomedOut={zoomedOut}
                rotation={0}
                eligible={eligibleSeatIds.has(s.id)}
                selected={s.id === selectedSeatId}
                onPointerDown={down}
              />
            );
          })}
        </div>

        {/* Floating mini-toolbar for the selected zone (screen-space overlay). */}
        {selZone && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={miniBarAt(selZone.x, selZone.y)}
            className="z-20 flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5 shadow-lg"
          >
            <button type="button" className={miniBtn} onClick={() => onRotateZone(selZone)}>
              ⟳ 45°
            </button>
            <button type="button" className={miniBtn} onClick={() => onRenameZone(selZone)}>
              Rename
            </button>
            {selZone.kind === "sro" && (
              <button type="button" className={miniBtn} onClick={() => onZoneCapacity(selZone)}>
                Cap {selZone.capacity ?? "—"}
              </button>
            )}
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => onDeleteZone(selZone)}
            >
              Delete
            </button>
          </div>
        )}

        {/* Floating mini-toolbar for the selected seat. */}
        {selSeat && selSeatCenter && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            style={miniBarAt(selSeatCenter.cx - SEAT / 2, selSeatCenter.cy - SEAT / 2)}
            className="z-20 flex items-center gap-0.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5 shadow-lg"
          >
            <button type="button" className={miniBtn} onClick={() => onToggleSeatAvailable(selSeat)}>
              {selSeat.unavailable ? "Make available" : "Make unavailable"}
            </button>
            <button type="button" className={miniBtn} onClick={() => onRelabelSeat(selSeat)}>
              Relabel
            </button>
            <button
              type="button"
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
              onClick={() => onDeleteSeat(selSeat)}
            >
              Delete
            </button>
          </div>
        )}

        {/* Hint strip */}
        <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gray-900/70 px-3 py-1 text-[11px] text-white dark:bg-black/60">
          {mode === "edit"
            ? "Drag zones & seats · tap to select · scroll or pinch to zoom"
            : selectedPersonId
              ? "Tap a glowing seat to place — or tap Standing Room"
              : "Drag a person onto a seat · pinch or scroll to zoom"}
        </div>
      </div>

      {/* Drag ghost follows the pointer above everything. */}
      {dragging && (
        <div
          className="pointer-events-none fixed z-50"
          style={{ left: dragging.x, top: dragging.y, transform: "translate(-50%, -110%)" }}
        >
          <PersonChip person={dragging.person} variant="mini" />
        </div>
      )}
    </>
  );
}
