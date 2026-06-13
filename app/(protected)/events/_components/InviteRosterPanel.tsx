"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteParents } from "../actions";

export type InviteStatus = "none" | "invited" | "opened" | "declined" | "rsvped";

export type InviteRow = {
  parentId: string;
  name: string;
  email: string | null;
  players: string[];
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
  // Default selection: everyone not yet invited and not yet responded.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => r.status === "none").map((r) => r.parentId))
  );

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allIds = useMemo(() => rows.map((r) => r.parentId), [rows]);
  const allSelected = selected.size === allIds.length && allIds.length > 0;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(allIds));

  function invite() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setResult(null);
    start(async () => {
      const res = await inviteParents(eventId, ids);
      if (res.error) setResult(res.error);
      else
        setResult(
          `Invited ${res.invited}${res.sent ? ` · emailed ${res.sent}` : ""}${res.failed ? ` · ${res.failed} email failed` : ""}.`
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

      {/* Roster */}
      <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-96 overflow-y-auto">
        {rows.map((r) => {
          const b = BADGE[r.status];
          const checked = selected.has(r.parentId);
          const label = r.players.length ? r.players.join(", ") : r.name;
          const sub = r.players.length ? r.name : r.email ?? "no email";
          return (
            <li key={r.parentId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(r.parentId)}
                className="h-4 w-4 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-gray-800 dark:text-gray-200">{label}</p>
                <p className="truncate text-xs text-gray-400 dark:text-gray-500">
                  {sub}
                  {!r.email && r.players.length ? " · no email" : ""}
                </p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${b.cls}`}>{b.label}</span>
            </li>
          );
        })}
      </ul>
      <p className="px-4 py-2 text-xs text-gray-400 dark:text-gray-500">
        Inviting emails the signup link and adds it to the parent&rsquo;s dashboard until they RSVP or decline.
        Re-inviting someone re-sends the email.
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
