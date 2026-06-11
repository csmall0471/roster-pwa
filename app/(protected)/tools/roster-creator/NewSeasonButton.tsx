"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSeason } from "./actions";

// Creates a blank season and drops the user into the structure editor (step 1).
export default function NewSeasonButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const id = await createSeason(name || "Untitled season", sport);
      router.push(`/tools/roster-creator/${id}/setup`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create season.");
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        <span className="text-base leading-none">+</span> New season
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
      <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New season</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Season name</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Fall 2026"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Sport (optional)</span>
          <input
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
            placeholder="e.g. Basketball"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
      </div>
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Creating…" : "Create & set up structure →"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={busy}
          className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
