"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createSeasonFromRoster } from "./actions";
import type { ParsedCoachRoster, ParsedRosterDivision } from "./coach-roster";

export default function CoachRosterReview({
  parsed,
  defaultName,
  onCancel,
}: {
  parsed: ParsedCoachRoster;
  defaultName: string;
  onCancel: () => void;
}) {
  const router = useRouter();

  const [seasonName, setSeasonName] = useState(defaultName);
  const [sport, setSport] = useState("");
  const [defaultTeamSize, setDefaultTeamSize] = useState(10);
  // Per-division target sizes, keyed by division name.
  const [divTargets, setDivTargets] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const div of parsed.divisions) init[div.name] = 10;
    return init;
  });
  // Track which division targets have been manually overridden by the user.
  const [overridden, setOverridden] = useState<Set<string>>(new Set());

  // Expanded/collapsed state per division.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleDefaultTeamSizeChange(raw: number) {
    const val = Math.max(1, raw || 1);
    setDefaultTeamSize(val);
    // Propagate to any division that hasn't been manually overridden.
    setDivTargets((prev) => {
      const next = { ...prev };
      for (const div of parsed.divisions) {
        if (!overridden.has(div.name)) {
          next[div.name] = val;
        }
      }
      return next;
    });
  }

  function handleDivTargetChange(divName: string, raw: number) {
    const val = Math.max(1, raw || 1);
    setOverridden((prev) => new Set(prev).add(divName));
    setDivTargets((prev) => ({ ...prev, [divName]: val }));
  }

  function toggleExpanded(divName: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(divName)) next.delete(divName);
      else next.add(divName);
      return next;
    });
  }

  function divSummary(div: ParsedRosterDivision) {
    const total = div.teams.length;
    const coached = div.teams.filter((t) => !t.isPlaceholder).length;
    const open = div.teams.filter((t) => t.isPlaceholder).length;
    return `${total} ${total === 1 ? "team" : "teams"} · ${coached} coached · ${open} open`;
  }

  async function handleSubmit() {
    if (!seasonName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const seasonId = await createSeasonFromRoster({
        seasonName: seasonName.trim(),
        sport: sport.trim() || undefined,
        defaultTeamSize: Math.max(1, defaultTeamSize),
        divisions: parsed.divisions.map((div) => ({
          name: div.name,
          targetTeamSize: Math.max(1, divTargets[div.name] ?? defaultTeamSize),
          teams: div.teams.map((t) => ({
            coachName: t.coachName,
            isPlaceholder: t.isPlaceholder,
            rawLabel: t.rawLabel,
          })),
        })),
      });
      router.push(`/tools/roster-creator/${seasonId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create season.");
      setBusy(false);
    }
  }

  const canSubmit = !busy && seasonName.trim().length > 0;

  return (
    <div className="space-y-8">
      {/* Sticky action bar */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Creating season…" : "Create season & continue"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
        >
          Cancel
        </button>
        <span className="text-xs text-gray-400">
          {parsed.divisions.length}{" "}
          {parsed.divisions.length === 1 ? "division" : "divisions"} ·{" "}
          {parsed.divisions.reduce((n, d) => n + d.teams.length, 0)} teams
        </span>
        {error && (
          <span className="ml-auto text-xs text-red-600 dark:text-red-400">
            {error}
          </span>
        )}
      </div>

      {/* Season settings */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Season settings
        </h2>
        <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Season name <span className="text-red-500">*</span>
              </span>
              <input
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                Sport (optional)
              </span>
              <input
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                placeholder="e.g. Basketball"
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              />
            </label>
          </div>
          <label className="flex flex-col gap-1 w-36">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
              Default players per team
            </span>
            <input
              type="number"
              min={1}
              value={defaultTeamSize}
              onChange={(e) => handleDefaultTeamSizeChange(+e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            />
            <span className="text-[11px] text-gray-400">
              applied to each division unless overridden below
            </span>
          </label>
        </div>
      </section>

      {/* Per-division cards */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Divisions &amp; teams
        </h2>
        <div className="space-y-4">
          {parsed.divisions.map((div) => {
            const isOpen = expanded.has(div.name);
            return (
              <div
                key={div.name}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
              >
                {/* Division header row */}
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gray-50 dark:bg-gray-800/50">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-semibold text-gray-900 dark:text-white truncate">
                      {div.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {divSummary(div)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-300">
                      Players/team
                      <input
                        type="number"
                        min={1}
                        value={divTargets[div.name] ?? defaultTeamSize}
                        onChange={(e) =>
                          handleDivTargetChange(div.name, +e.target.value)
                        }
                        className="w-16 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(div.name)}
                      className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 12 12"
                        className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
                        aria-hidden="true"
                      >
                        <path
                          d="M4 2.5L7.5 6L4 9.5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          fill="none"
                        />
                      </svg>
                      {isOpen ? "Hide teams" : "Show teams"}
                    </button>
                  </div>
                </div>

                {/* Collapsible team list */}
                {isOpen && (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-72 overflow-y-auto">
                    {div.teams.map((team, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-3 px-4 py-2.5"
                      >
                        {team.isPlaceholder ? (
                          <>
                            <span className="text-base leading-none" aria-hidden="true">
                              🪑
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 flex-1">
                              {team.rawLabel}
                            </span>
                            <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                              open slot
                            </span>
                          </>
                        ) : (
                          <>
                            <span
                              className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-[10px] font-semibold text-blue-700 dark:text-blue-300 shrink-0"
                              aria-hidden="true"
                            >
                              {(i + 1)}
                            </span>
                            <span className="text-sm text-gray-900 dark:text-gray-100 flex-1">
                              {team.coachName}
                            </span>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
