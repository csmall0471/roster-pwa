"use client";

import Link from "next/link";
import { useState } from "react";

export type PastTeamEntry = {
  teamId: string;
  teamName: string;
  meta: string | null;
  dateRange: string | null;
  jerseyNumber: number | null;
};

export default function PastTeamsExpander({ entries }: { entries: PastTeamEntry[] }) {
  const [open, setOpen] = useState(false);

  if (entries.length === 0) return null;

  return (
    <>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-5 py-2.5 flex items-center justify-between text-sm text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-t border-gray-100 dark:border-gray-800"
      >
        <span>{entries.length} past team{entries.length !== 1 ? "s" : ""}</span>
        <span className="text-xs">{open ? "▲" : "▼"}</span>
      </button>
      {open && entries.map((entry, i) => (
        <Link
          key={i}
          href={`/parent/team/${entry.teamId}`}
          className="px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors opacity-50 border-t border-gray-100 dark:border-gray-800"
        >
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{entry.teamName}</p>
            {entry.meta && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{entry.meta}</p>}
            {entry.dateRange && <p className="text-xs text-gray-400 dark:text-gray-500">{entry.dateRange}</p>}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {entry.jerseyNumber != null && (
              <span className="text-sm font-mono text-gray-500 dark:text-gray-400">#{entry.jerseyNumber}</span>
            )}
            <span className="text-gray-400 dark:text-gray-500">→</span>
          </div>
        </Link>
      ))}
    </>
  );
}
