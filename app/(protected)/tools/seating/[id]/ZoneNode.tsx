"use client";

import { memo } from "react";
import type { PersonVM, SeatVM, ZoneVM } from "../types";
import SeatNode, { type ZoomTier } from "./SeatNode";
import PersonChip from "./PersonChip";

type Props = {
  zone: ZoneVM;
  seats: SeatVM[]; // this zone's seats (zone-local coords)
  occupantBySeat: Map<string, PersonVM>;
  sroPeople: PersonVM[]; // occupants of this zone when kind === "sro"
  mode: "assign" | "edit";
  zoom: ZoomTier;
  selected: boolean;
  selectedPersonId: string | null;
  selectedSeatId: string | null;
  eligibleSeatIds: Set<string>;
  onZonePointerDown?: (zone: ZoneVM, e: React.PointerEvent) => void; // edit mode drag/select
  onSeatPointerDown?: (seat: SeatVM, e: React.PointerEvent) => void; // edit mode drag/select
  onChipPointerDown?: (person: PersonVM, e: React.PointerEvent) => void; // assign mode drag
};

// One zone on the canvas. The zone div itself carries the rotation transform
// (top-left origin); seats render inside at their zone-local coords and
// counter-rotate their content so names stay upright.
function ZoneNode({
  zone,
  seats,
  occupantBySeat,
  sroPeople,
  mode,
  zoom,
  selected,
  selectedPersonId,
  selectedSeatId,
  eligibleSeatIds,
  onZonePointerDown,
  onSeatPointerDown,
  onChipPointerDown,
}: Props) {
  const edit = mode === "edit";
  const frame: React.CSSProperties = {
    left: zone.x,
    top: zone.y,
    width: zone.w,
    height: zone.h,
    transform: zone.rotation ? `rotate(${zone.rotation}deg)` : undefined,
    transformOrigin: "top left",
    position: "absolute",
  };
  const editable = edit
    ? "cursor-move hover:border-blue-400 dark:hover:border-blue-600"
    : "";
  const ring = selected ? "ring-2 ring-blue-500" : "";
  const zoneDown = edit && onZonePointerDown ? (e: React.PointerEvent) => onZonePointerDown(zone, e) : undefined;

  if (zone.kind === "table") {
    // Cocktail table + four chairs, like the lounge renders.
    const chair = "absolute h-[22%] w-[22%] rounded-full bg-stone-400/80 dark:bg-stone-600/80";
    return (
      <div onPointerDown={zoneDown} style={frame} className={`${editable} ${ring} rounded-full`} title={zone.label || "Lounge table"}>
        <span className={chair} style={{ left: "39%", top: "-6%" }} />
        <span className={chair} style={{ left: "39%", bottom: "-6%" }} />
        <span className={chair} style={{ left: "-6%", top: "39%" }} />
        <span className={chair} style={{ right: "-6%", top: "39%" }} />
        <div className="absolute inset-[12%] rounded-full border-2 border-stone-400/80 dark:border-stone-600 bg-gradient-to-br from-stone-200 to-stone-300 dark:from-stone-800 dark:to-stone-900 shadow-sm" />
        <div className="absolute inset-[38%] rounded-full bg-stone-300/90 dark:bg-stone-700/90" />
      </div>
    );
  }

  if (zone.kind === "bar") {
    // A lounge bar: stone counter with an inner service line and a brass edge.
    return (
      <div
        onPointerDown={zoneDown}
        style={frame}
        className={`rounded-xl border-2 border-stone-400 dark:border-stone-600 bg-gradient-to-b from-stone-200 via-stone-100 to-stone-300 dark:from-stone-800 dark:via-stone-900 dark:to-stone-950 shadow-md ${editable} ${ring}`}
        title={zone.label || "Bar"}
      >
        <div className="absolute inset-x-2 top-1.5 h-1 rounded-full bg-amber-600/50 dark:bg-amber-500/40" />
        <div className="absolute inset-[18%] rounded-lg border border-stone-400/60 dark:border-stone-600/60" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[13px] font-bold uppercase tracking-[0.5em] text-stone-500 dark:text-stone-400 pl-[0.5em]">
            {zone.label || "BAR"}
          </span>
        </div>
      </div>
    );
  }

  if (zone.kind === "sro") {
    const cap = zone.capacity;
    const over = cap != null && sroPeople.length > cap;
    return (
      <div
        onPointerDown={zoneDown}
        style={frame}
        className={`rounded-xl border-2 border-dashed border-amber-400/60 bg-amber-50/40 dark:bg-amber-950/20 p-3 ${editable} ${ring}`}
      >
        <div
          className={`text-[11px] font-bold uppercase tracking-wide ${
            over ? "text-red-600 dark:text-red-400" : "text-amber-700 dark:text-amber-400"
          }`}
        >
          {zone.label || "Standing Room"} · {sroPeople.length}
          {cap != null ? `/${cap}` : ""}
          {over ? " ⚠" : ""}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sroPeople.map((p) => (
            <PersonChip
              key={p.id}
              person={p}
              variant="mini"
              selected={p.id === selectedPersonId}
              onPointerDown={
                !edit && onChipPointerDown ? (e) => onChipPointerDown(p, e) : undefined
              }
            />
          ))}
          {sroPeople.length === 0 && (
            <span className="text-[11px] text-amber-600/70 dark:text-amber-500/60">
              Drop people here to stand
            </span>
          )}
        </div>
      </div>
    );
  }

  // Cluster: a bar-ledge section — the drink ledge along the court edge (local
  // TOP; rotates with the zone), Row 1 at the ledge, the section label along
  // the bottom where you'd read it standing in the lounge behind the seats.
  return (
    <div
      onPointerDown={zoneDown}
      style={frame}
      className={`rounded-lg border border-gray-300/80 dark:border-gray-700 bg-white/85 dark:bg-gray-900/80 shadow-sm ${editable} ${ring}`}
    >
      {/* Drink ledge / rail the seats face (court side). */}
      <div
        className="absolute inset-x-1 top-1 h-2.5 rounded-full bg-gradient-to-b from-amber-700 to-amber-900 dark:from-amber-800 dark:to-amber-950 opacity-80"
        title="Ledge (court side)"
      />
      <div className="absolute bottom-1 left-2 text-[12px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {zone.label}
      </div>
      {seats.map((s) => {
        const occupant = occupantBySeat.get(s.id) ?? null;
        const down = edit
          ? onSeatPointerDown && ((e: React.PointerEvent) => onSeatPointerDown(s, e))
          : occupant && onChipPointerDown
            ? (e: React.PointerEvent) => onChipPointerDown(occupant, e)
            : undefined;
        return (
          <SeatNode
            key={s.id}
            seat={s}
            occupant={occupant}
            zoom={zoom}
            rotation={zone.rotation}
            eligible={eligibleSeatIds.has(s.id)}
            selected={s.id === selectedSeatId}
            onPointerDown={down}
          />
        );
      })}
    </div>
  );
}

export default memo(ZoneNode);
