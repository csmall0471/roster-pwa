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
  invited: boolean; // at least one parent was sent an invite
};

// The funnel buckets you can filter by. Definitions mirror the stat counts:
// opened/rsvped/declined all imply "invited", and rsvped/declined imply opened.
type Filter = "invited" | "opened" | "rsvped" | "declined";
const matchesFilter = (r: InviteRow, f: Filter): boolean => {
  if (!r.invited) return false;
  if (f === "invited") return true;
  if (f === "opened") return r.status === "opened" || r.status === "rsvped" || r.status === "declined";
  return r.status === f; // rsvped | declined
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
  // Optional funnel filter (click a stat to narrow the list).
  const [filter, setFilter] = useState<Filter | null>(null);
  const visible = useMemo(() => (filter ? rows.filter((r) => matchesFilter(r, filter)) : rows), [rows, filter]);

  const toggle = (key: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const visibleKeys = useMemo(() => visible.map((r) => r.key), [visible]);
  const allSelected = visibleKeys.length > 0 && visibleKeys.every((k) => selected.has(k));
  const toggleAll = () =>
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) for (const k of visibleKeys) next.delete(k);
      else for (const k of visibleKeys) next.add(k);
      return next;
    });

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
      {/* Funnel — click a stat to filter the list to that bucket */}
      <div className="grid grid-cols-4 divide-x divide-gray-100 dark:divide-gray-800 border-b border-gray-100 dark:border-gray-800">
        <Stat label="Invited" value={stats.invited} active={filter === "invited"} onClick={() => setFilter((f) => (f === "invited" ? null : "invited"))} />
        <Stat label="Opened" value={stats.opened} active={filter === "opened"} onClick={() => setFilter((f) => (f === "opened" ? null : "opened"))} />
        <Stat label="RSVP'd" value={stats.rsvped} active={filter === "rsvped"} onClick={() => setFilter((f) => (f === "rsvped" ? null : "rsvped"))} />
        <Stat label="Declined" value={stats.declined} active={filter === "declined"} onClick={() => setFilter((f) => (f === "declined" ? null : "declined"))} />
      </div>
      {filter && (
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-1.5 text-xs text-blue-700 dark:text-blue-300">
          <span>Showing <strong>{filter === "rsvped" ? "RSVP'd" : filter}</strong> — {visible.length} player{visible.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={() => setFilter(null)} className="font-semibold hover:underline">
            Clear filter
          </button>
        </div>
      )}

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
        {visible.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-gray-400 dark:text-gray-500">No players in this bucket.</li>
        )}
        {visible.map((r) => {
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

function Stat({ label, value, active, onClick }: { label: string; value: number; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`p-3 text-center transition-colors ${
        active ? "bg-blue-50 dark:bg-blue-950/40" : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
      }`}
    >
      <p className={`text-xl font-bold ${active ? "text-blue-700 dark:text-blue-300" : "text-gray-900 dark:text-white"}`}>{value}</p>
      <p className={`text-xs ${active ? "text-blue-600 dark:text-blue-400 font-medium" : "text-gray-500 dark:text-gray-400"}`}>{label}</p>
    </button>
  );
}
