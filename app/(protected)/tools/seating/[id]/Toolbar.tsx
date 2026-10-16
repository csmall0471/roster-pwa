"use client";

import { useState } from "react";
import type { SeatingEventInfo } from "../types";

type Mode = "assign" | "edit";
export type AddKind = "2x4" | "2x2" | "1x4" | "seat" | "table" | "bar" | "sro";

type Props = {
  mode: Mode;
  onMode: (m: Mode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  seated: number;
  seatsAvailable: number;
  sro: number;
  sroCap: number | null;
  onPlaceUnassigned: () => void;
  onRerun: () => void;
  onClearUnlocked: () => void;
  event: SeatingEventInfo | null;
  onToggleCollect: (on: boolean) => void;
  onUnlink: () => void;
  onOpenLink: () => void;
  onAdd: (kind: AddKind) => void;
  onResetLayout: () => void;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onClearAll: () => void;
};

const btn =
  "rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800";

function Menu({
  label,
  items,
  accent = false,
}: {
  label: string;
  items: { label: string; onClick: () => void }[];
  accent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={
          accent
            ? "rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
            : btn
        }
      >
        {label} ▾
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-1 shadow-xl">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// The control row above the map: mode toggle, zoom, capacity chips, the
// auto-assign menu, the linked-event chip, and (edit mode) the "+ Add" menu.
export default function Toolbar({
  mode,
  onMode,
  onZoomIn,
  onZoomOut,
  onFit,
  seated,
  seatsAvailable,
  sro,
  sroCap,
  onPlaceUnassigned,
  onRerun,
  onClearUnlocked,
  event,
  onToggleCollect,
  onUnlink,
  onOpenLink,
  onAdd,
  onResetLayout,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onClearAll,
}: Props) {
  const seatsOver = seated > seatsAvailable;
  const sroOver = sroCap != null && sro > sroCap;
  const chip =
    "inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs font-semibold";

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {/* Mode segmented control */}
      <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        {(["assign", "edit"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onMode(m)}
            className={`px-3 py-1.5 text-sm font-semibold ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            }`}
          >
            {m === "assign" ? "Assign" : "Edit layout"}
          </button>
        ))}
      </div>

      {/* Zoom */}
      <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <button type="button" onClick={onZoomOut} className="bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="Zoom out">
          −
        </button>
        <button type="button" onClick={onFit} className="border-x border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">
          Fit
        </button>
        <button type="button" onClick={onZoomIn} className="bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800" aria-label="Zoom in">
          +
        </button>
      </div>

      {/* Undo / redo / clear */}
      <div className="flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Cmd/Ctrl+Z)"
          aria-label="Undo"
          className="bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-35"
        >
          ↩
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Shift+Cmd/Ctrl+Z)"
          aria-label="Redo"
          className="border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-35"
        >
          ↪
        </button>
      </div>
      <button
        type="button"
        onClick={onClearAll}
        title="Unassign every seat (locked included) — undoable"
        className={btn}
      >
        Clear seats
      </button>

      {/* Capacity chips */}
      <span
        className={`${chip} ${
          seatsOver ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"
        }`}
        title="People in seats / available seats"
      >
        Seated {seated}/{seatsAvailable}
        {seatsOver && " ⚠"}
      </span>
      <span
        className={`${chip} ${
          sroOver ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"
        }`}
        title="People standing / SRO capacity"
      >
        SRO {sro}
        {sroCap != null && `/${sroCap}`}
        {sroOver && " ⚠"}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Menu
          accent
          label="Auto-assign"
          items={[
            { label: "Place unassigned kids", onClick: onPlaceUnassigned },
            { label: "Re-run (shuffle)", onClick: onRerun },
            { label: "Clear unlocked", onClick: onClearUnlocked },
          ]}
        />

        {mode === "edit" && (
          <Menu
            label="+ Add"
            items={[
              { label: "Section 2 rows × 4 (8 seats)", onClick: () => onAdd("2x4") },
              { label: "Row 1×4 (4 seats)", onClick: () => onAdd("1x4") },
              { label: "Cluster 2×2 (4 seats)", onClick: () => onAdd("2x2") },
              { label: "Single seat", onClick: () => onAdd("seat") },
              { label: "Bar", onClick: () => onAdd("bar") },
              { label: "Table", onClick: () => onAdd("table") },
              { label: "SRO zone", onClick: () => onAdd("sro") },
            ]}
          />
        )}
        {mode === "edit" && (
          <button type="button" onClick={onResetLayout} className={btn} title="Replace the layout with the seeded Hideaway Lounge (people stay; seats unassign)">
            ↺ Reset layout
          </button>
        )}

        {/* Event chip */}
        {event ? (
          <span className="inline-flex max-w-full items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-2.5 py-1 text-xs">
            <span className="max-w-[160px] truncate font-semibold text-gray-800 dark:text-gray-200" title={event.title}>
              🎟 {event.title}
            </span>
            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400">
              {event.status}
            </span>
            <button
              type="button"
              onClick={() => onToggleCollect(!event.collectSitBy)}
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                event.collectSitBy
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
              }`}
              title="Ask RSVPs who their kid wants to sit by"
            >
              sit-by {event.collectSitBy ? "on" : "off"}
            </button>
            <button
              type="button"
              onClick={onUnlink}
              className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              title="Unlink event"
              aria-label="Unlink event"
            >
              ✕
            </button>
          </span>
        ) : (
          <button type="button" onClick={onOpenLink} className={btn}>
            Link event…
          </button>
        )}
      </div>
    </div>
  );
}
