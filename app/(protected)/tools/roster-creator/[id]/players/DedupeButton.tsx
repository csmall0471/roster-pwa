"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dedupeSeasonPlayers } from "../../actions";

// Shown only when a season already contains duplicate players (same name + age
// group). One-click cleanup that keeps the most complete copy of each kid.
export default function DedupeButton({ seasonId, count }: { seasonId: string; count: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Hide once there's nothing to clean (unless we just finished, to show the
  // confirmation).
  if (count <= 0 && !done) return null;

  function run() {
    if (
      !confirm(
        `Remove ${count} duplicate player${count === 1 ? "" : "s"}? The most complete copy of each kid ` +
          `is kept (an assigned player over an unassigned one). This can't be undone.`
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await dedupeSeasonPlayers(seasonId);
      if (res.error) setError(res.error);
      else setDone(`Removed ${res.removed} duplicate${res.removed === 1 ? "" : "s"}.`);
      router.refresh();
    });
  }

  if (done) {
    return (
      <p className="mb-4 rounded-lg border border-green-200 dark:border-green-900/50 bg-green-50/50 dark:bg-green-950/20 px-4 py-3 text-sm text-green-700 dark:text-green-300">
        {done}
      </p>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3">
      <p className="text-sm text-amber-800 dark:text-amber-300">
        <span className="font-semibold">
          {count} duplicate player{count === 1 ? "" : "s"}
        </span>{" "}
        found in this season (same name &amp; age group).
      </p>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="ml-auto inline-flex items-center rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {pending ? "Removing…" : `Remove ${count} duplicate${count === 1 ? "" : "s"}`}
      </button>
      {error && <span className="w-full text-xs text-red-600 dark:text-red-400">{error}</span>}
    </div>
  );
}
