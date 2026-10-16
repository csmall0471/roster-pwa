"use client";

import { memo } from "react";
import type { PersonVM, SeatVM } from "../types";
import { SEAT } from "../layout-seed";
import { isKid, initialsOf } from "./PersonChip";

// Diagonal "not owned" stripes, readable in both themes.
const STRIPES =
  "repeating-linear-gradient(45deg, rgba(120,120,130,0.25) 0 6px, transparent 6px 12px)";

function nameLines(name: string): [string, string] {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? `${parts[parts.length - 1][0]}.` : "";
  return [first, last];
}

// One 60px seat square. Positioned absolutely at the seat's coords — zone-local
// when rendered inside a (rotated) ZoneNode, canvas-absolute for loose seats.
// Content is counter-rotated by the zone's rotation so names stay upright.
function SeatNode({
  seat,
  occupant,
  zoomedOut,
  rotation = 0,
  eligible = false,
  selected = false,
  onPointerDown,
}: {
  seat: SeatVM;
  occupant: PersonVM | null;
  zoomedOut: boolean;
  rotation?: number;
  eligible?: boolean;
  selected?: boolean;
  onPointerDown?: (e: React.PointerEvent) => void;
}) {
  const base =
    "absolute rounded-lg text-center select-none touch-none overflow-hidden transition-shadow";
  const look = occupant
    ? isKid(occupant)
      ? "bg-blue-600 text-white"
      : "bg-violet-600 text-white"
    : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300";
  const ring = selected
    ? "ring-2 ring-blue-500"
    : eligible
      ? "ring-2 ring-blue-500 animate-pulse"
      : "";

  const title = occupant
    ? `${seat.label} — ${occupant.displayName}${occupant.locked ? " (locked)" : ""}`
    : seat.unavailable
      ? `${seat.label} — unavailable`
      : seat.label;

  const [first, lastInitial] = occupant ? nameLines(occupant.displayName) : ["", ""];

  return (
    <div
      onPointerDown={onPointerDown}
      title={title}
      className={`${base} ${look} ${ring} ${seat.unavailable ? "opacity-50" : ""} ${
        onPointerDown ? "cursor-grab active:cursor-grabbing" : ""
      }`}
      style={{
        left: seat.x,
        top: seat.y,
        width: SEAT,
        height: SEAT,
        backgroundImage: seat.unavailable ? STRIPES : undefined,
      }}
    >
      {/* Counter-rotate the content so names stay upright inside rotated zones. */}
      <div
        className="flex h-full w-full items-center justify-center"
        style={rotation ? { transform: `rotate(${-rotation}deg)` } : undefined}
      >
        {occupant ? (
          zoomedOut ? (
            <span className="text-xs font-bold">{initialsOf(occupant.displayName)}</span>
          ) : (
            <span className="block px-0.5 text-[10px] leading-tight font-semibold">
              <span className="block truncate" style={{ maxWidth: SEAT - 6 }}>
                {first}
              </span>
              {lastInitial && <span className="block">{lastInitial}</span>}
            </span>
          )
        ) : (
          !zoomedOut && (
            <span className="text-[8px] font-medium text-gray-400 dark:text-gray-500">
              {seat.label}
            </span>
          )
        )}
      </div>

      {occupant?.locked && (
        <span className="absolute top-0 right-0 rounded-bl-md bg-white/90 dark:bg-gray-900/90 px-0.5 text-[9px] leading-none">
          🔒
        </span>
      )}
    </div>
  );
}

export default memo(SeatNode);
