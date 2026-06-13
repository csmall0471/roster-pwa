"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteParents } from "../actions";

export type InviteStatus = "none" | "invited" | "opened" | "declined" | "rsvped";

// One row = one player (or an off-roster invited parent). Inviting a row invites
// every parent in `parentIds`, so both of a kid's parents get notified.
export type InviteRow = {
  key: string;
  label: string; // player name
  sub: string; // parents / email summary
  parentIds: string[];
  emailCount: number;
  status: InviteStatus;
};

const BADGE: Record<InviteStatus, { label: string; cls: string }> = {
  none: { label: "Not invited", cls: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" },
  invited: { label: "Invited", cls: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300" },
  opened: { label: "Opened", cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  declined: { label: "Declined", cls: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  rsvped: { label: "RSVP'd", cls: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
};

export default function InviteRosterPanel({
  eventId,
  rows,
  stats,
}: {
  eventId: string;
  rows: InviteRow[];
  stats: { invited: number; opened: number; declined: number; rsvped: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<string | null>(null);
  // Default: pre-select every player not yet invited.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.status === "none").map((r) => r.key))
  );

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allKeys = useMemo(() => rows.map((r) => r.key), [rows]);
  const allSelected = selected.size === allKeys.length && allKeys.length > 0;
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allKeys));

  // Union of parent ids across the selected players.
  const selectedParentIds = useMemo(() => {
    const ids = new Set<string>();
    for (const r of rows) if (selected.has(r.key)) for (const id of r.parentIds) ids.add(id);
    return [...ids];
  }, [rows, selected]);

  function invite() {
    if (selectedParentIds.length === 0) return;
    setResult(null);
    start(async () => {
      const res = await inviteParents(eventId, selectedParentIds);
      if (res.error) setResult(res.error);
      else
        setResult(
          `Invited ${selected.size} player${selected.size === 1 ? "" : "s"}` +
            `${res.sent ? ` · emailed ${res.sent} parent${res.sent === 1 ? "" : "s"}` : ""}` +
            `${res.failed ? ` · ${res.failed} email failed` : ""}.`
        );
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      {/* Funnel */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
        <Stat label="Invited" value={stats.invited} />
        <Stat label="Opened" value={stats.opened} />
        <Stat label="RSVP'd" value={stats.rsvped} />
        <Stat label="Declined" value={stats.declined} />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 dark:border-gray-800 px-4 py-2.5">
        <label className="flex items-center gap-2 text-xs font-medium text-gray-500 dark:text-gray-400">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4" />
          Select all
        </label>
        <div className="flex items-center gap-3">
          {result && <span className="text-xs text-gray-500 dark:text-gray-400">{result}</span>}
          <button
            type="button"
            onClick={invite}
            disabled={pending || selected.size === 0}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pending ? "Inviting…" : `Invite selected (${selected.size})`}
          </button>
        </div>
      </div>

      {/* Players */}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
        {rows.map((r) => {
          const b = BADGE[r.status];
          return (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={selected.has(r.key)}
                onChange={() => toggle(r.key)}
                className="h-4 w-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800 dark:text-gray-200">{r.label}</p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">{r.sub}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
        Inviting a player emails the signup link to <strong>both parents</strong> and adds it to their dashboard
        until they RSVP or decline. Either parent edits the same RSVP. Re-inviting re-sends.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="p-3 text-center">
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}
