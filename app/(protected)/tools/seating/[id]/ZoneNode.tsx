"use client";

import { memo } from "react";
import type { PersonVM, SeatVM, ZoneVM } from "../types";
import SeatNode from "./SeatNode";
import PersonChip from "./PersonChip";

type Props = {
  zone: ZoneVM;
  seats: SeatVM[]; // this zone's seats (zone-local coords)
  occupantBySeat: Map<string, PersonVM>;
  sroPeople: PersonVM[]; // occupants of this zone when kind === "sro"
  mode: "assign" | "edit";
  zoomedOut: boolean;
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
  zoomedOut,
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
    return (
      <div
        onPointerDown={zoneDown}
        style={frame}
        className={`rounded-full border-2 border-gray-300/70 dark:border-gray-700 bg-gray-200/40 dark:bg-gray-800/40 ${editable} ${ring}`}
        title={zone.label || "Lounge table"}
      />
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

  // Cluster: dashed footprint + label strip + its seats.
  return (
    <div
      onPointerDown={zoneDown}
      style={frame}
      className={`rounded-lg border border-dashed border-gray-300 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60 ${editable} ${ring}`}
    >
      <div className="absolute left-1.5 top-1 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
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
            zoomedOut={zoomedOut}
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
