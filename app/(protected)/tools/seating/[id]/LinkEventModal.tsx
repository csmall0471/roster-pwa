"use client";

import { useMemo, useState } from "react";

export type EventOption = {
  id: string;
  title: string;
  slug: string;
  status: string;
  starts_at: string | null;
};

const STATUS_CHIP: Record<string, string> = {
  published: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "No date";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No date";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// Pick which event this seating plan tracks (RSVP statuses + sit-by picks flow
// in from it). Published events float to the top.
export default function LinkEventModal({
  events,
  currentEventId,
  onClose,
  onPick,
  onUnlink,
}: {
  events: EventOption[];
  currentEventId: string | null;
  onClose: () => void;
  onPick: (eventId: string) => Promise<void>;
  onUnlink: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) =>
          Number(b.status === "published") - Number(a.status === "published") ||
          (b.starts_at ?? "").localeCompare(a.starts_at ?? "")
      ),
    [events]
  );

  async function pick(id: string) {
    if (busyId) return;
    setBusyId(id);
    try {
      await onPick(id);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Link an event</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="mt-3 space-y-1">
          {sorted.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No events yet — create one on the Events page first.
            </p>
          )}
          {sorted.map((e) => {
            const linked = e.id === currentEventId;
            return (
              <button
                key={e.id}
                type="button"
                disabled={busyId != null}
                onClick={() => pick(e.id)}
                className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60 ${
                  linked
                    ? "border-blue-500 ring-1 ring-blue-500"
                    : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">
                    {e.title}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400">
                    {fmtDate(e.starts_at)}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                    STATUS_CHIP[e.status] ??
                    "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                  }`}
                >
                  {e.status}
                </span>
                {linked && (
                  <span className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400">
                    linked
                  </span>
                )}
                {busyId === e.id && (
                  <span className="shrink-0 text-xs text-gray-400">linking…</span>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          Linking turns on the sit-by question on the public RSVP page.
        </p>

        {currentEventId && (
          <button
            type="button"
            onClick={onUnlink}
            className="mt-2 w-full rounded-lg border border-red-200 dark:border-red-900/60 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Unlink current event
          </button>
        )}
      </div>
    </div>
  );
}
