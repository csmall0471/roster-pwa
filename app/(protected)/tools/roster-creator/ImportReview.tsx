"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { commitImport } from "./actions";
import {
  type CanonicalField,
  type ColumnMapping,
  FIELD_DEFS,
  canonicalRecord,
  isNoRequest,
  packageOf,
} from "./fields";
import { type Weights, DEFAULT_CONFIG } from "./group/engine";
import { extractAge } from "./resolve/hints";
import type { ParsedSheet } from "./parse";

const WEIGHT_KEYS: (keyof Weights)[] = ["coach", "team", "buddy", "night"];
const WEIGHT_LABEL: Record<keyof Weights, string> = {
  coach: "Coach request",
  team: "Team-name request",
  buddy: "Buddy / family",
  night: "Practice night",
};
const SCALE = [8, 6, 3, 1];

export type SeasonOption = { id: string; name: string };

const PREVIEW_FIELDS: CanonicalField[] = [
  "first_name",
  "last_name",
  "gender",
  "age_group",
  "school",
  "coach_first",
  "coach_last",
  "team_name",
  "buddy_first",
  "buddy_last",
  "practice_nights",
];

const REQUEST_FIELDS = new Set<CanonicalField>([
  "coach_first",
  "coach_last",
  "team_name",
  "buddy_first",
  "buddy_last",
]);

export default function ImportReview({
  parsed,
  seasons,
  defaultName,
  filename,
  onCancel,
  lockedSeasonId,
}: {
  parsed: ParsedSheet;
  seasons: SeasonOption[];
  defaultName: string;
  filename: string;
  onCancel: () => void;
  // When set, players import straight into this season (the new coach-first
  // flow uploads players from the season page) — no new/existing chooser.
  lockedSeasonId?: string;
}) {
  const router = useRouter();
  const [mapping, setMapping] = useState<ColumnMapping>(() => parsed.mapping);
  const [mode, setMode] = useState<"new" | "existing">(lockedSeasonId ? "existing" : "new");
  const [seasonName, setSeasonName] = useState(defaultName);
  const [sport, setSport] = useState("");
  const [existingSeasonId, setExistingSeasonId] = useState(lockedSeasonId ?? seasons[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Team settings — set up front so the rest of the flow is straight-through.
  const [target, setTarget] = useState(DEFAULT_CONFIG.target);
  const [order, setOrder] = useState<(keyof Weights)[]>([...WEIGHT_KEYS]);
  function reorderPriority(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
  }

  const PREVIEW_LIMIT = 10;
  function toggleGroup(pkg: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pkg)) next.delete(pkg);
      else next.add(pkg);
      return next;
    });
  }

  function setField(field: CanonicalField, header: string) {
    setMapping((prev) => {
      const next = { ...prev };
      if (header) next[field] = header;
      else delete next[field];
      return next;
    });
  }

  const missingRequired = FIELD_DEFS.filter((f) => f.required && !mapping[f.key]);

  const groups = useMemo(() => {
    const map = new Map<string, ReturnType<typeof canonicalRecord>[]>();
    for (const row of parsed.rows) {
      const rec = canonicalRecord(row, mapping);
      const pkg = packageOf(rec);
      if (!map.has(pkg)) map.set(pkg, []);
      map.get(pkg)!.push(rec);
    }
    // Sort by age bracket (6U, 8U, 10U, …), then name for gender tiebreak.
    return [...map.entries()].sort(
      (a, b) => (extractAge(a[0]) ?? 999) - (extractAge(b[0]) ?? 999) || a[0].localeCompare(b[0])
    );
  }, [parsed.rows, mapping]);

  const previewCols = PREVIEW_FIELDS.filter((f) => mapping[f]);

  async function commit() {
    setBusy(true);
    setError(null);
    try {
      const weights = {} as Weights;
      order.forEach((k, idx) => (weights[k] = SCALE[idx] ?? 1));
      const seasonId = await commitImport({
        existingSeasonId: mode === "existing" ? existingSeasonId : undefined,
        seasonName: mode === "new" ? seasonName : undefined,
        sport: mode === "new" ? sport : undefined,
        sourceFilename: filename,
        headers: parsed.headers,
        columnMapping: mapping,
        rows: parsed.rows,
        groupingConfig: { target, weights },
      });
      // Locked (coach-first flow): stay on the Players tab and auto-run the
      // analyze inline (?analyze=1) so the progress bar shows without leaving the
      // page. Legacy flow continues to the standalone confirm step.
      router.push(
        lockedSeasonId
          ? `/tools/roster-creator/${seasonId}/players?analyze=1`
          : `/tools/roster-creator/${seasonId}/confirm`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Sticky action bar — stays in view so you don't scroll to import */}
      <div className="sticky top-14 z-20 -mx-4 px-4 py-3 bg-gray-50/95 dark:bg-gray-950/95 backdrop-blur border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={commit}
          disabled={busy || missingRequired.length > 0}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? "Importing…" : `Import ${parsed.rows.length} players`}
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
          {groups.length} {groups.length === 1 ? "division" : "divisions"} detected
        </span>
        {missingRequired.length > 0 && (
          <span className="ml-auto text-xs text-amber-600 dark:text-amber-400">
            Map required fields first: {missingRequired.map((f) => f.label).join(", ")}
          </span>
        )}
        {error && <span className="ml-auto text-xs text-red-600 dark:text-red-400">{error}</span>}
      </div>

      {/* Import in progress */}
      {busy ? (
        <div className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-300">
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            Importing {parsed.rows.length} players…
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/40">
            <div className="tb-indeterminate-bar bg-blue-600" />
          </div>
          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
            Then Claude analyzes every signup — that progress bar shows on the next screen.
          </p>
        </div>
      ) : (
        /* What this screen does */
        <p className="rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
          We auto-detected your columns and grouped these players by division below. Give it a quick look,
          then press <strong>Import</strong>. Next, Claude matches every coach &amp; buddy request to your
          roster and you build the teams. A dash (—) means no request was entered; nothing is saved until
          you press Import.
        </p>
      )}

      {/* Target season */}
      {!lockedSeasonId && (
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Import into
        </h2>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
          {seasons.length > 0 && (
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
                New season
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} />
                Existing season
              </label>
            </div>
          )}

          {mode === "new" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Season name</span>
                <input
                  value={seasonName}
                  onChange={(e) => setSeasonName(e.target.value)}
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Sport (optional)</span>
                <input
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  placeholder="e.g. Flag Football"
                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
                />
              </label>
            </div>
          ) : (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Season</span>
              <select
                value={existingSeasonId}
                onChange={(e) => setExistingSeasonId(e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              >
                {seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </section>
      )}

      {/* Column mapping — auto-detected; collapsed unless a required field is unmapped */}
      <details
        open={missingRequired.length > 0}
        className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"
      >
        <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Column mapping
          <span className="font-normal normal-case text-xs text-gray-400">
            {missingRequired.length > 0
              ? `— ${missingRequired.length} required field${missingRequired.length === 1 ? "" : "s"} need mapping`
              : "— auto-detected; expand only if a column looks wrong"}
          </span>
        </summary>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 px-4 pb-4">
          {FIELD_DEFS.map((f) => (
            <label key={f.key} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              <select
                value={mapping[f.key] ?? ""}
                onChange={(e) => setField(f.key, e.target.value)}
                className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
              >
                <option value="">— not mapped —</option>
                {parsed.headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {missingRequired.length > 0 && (
          <p className="px-4 pb-4 text-sm text-amber-600 dark:text-amber-400">
            Map these required fields before importing: {missingRequired.map((f) => f.label).join(", ")}
          </p>
        )}
      </details>

      {/* Team settings */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
          Team settings
        </h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          How big teams should be and what matters most when grouping. You can fine-tune these later.
        </p>
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex flex-wrap items-start gap-6">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Target team size</span>
            <input type="number" min={1} value={target} onChange={(e) => setTarget(+e.target.value)}
              className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm" />
            <span className="text-[11px] text-gray-400">teams aim for this; smaller is fine, bigger only to keep a coach&rsquo;s kids together</span>
          </label>
          <div className="flex-1 min-w-[240px]">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Priority (top = most important)</span>
            <ol className="mt-1 space-y-1">
              {order.map((k, i) => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-4 text-right">{i + 1}.</span>
                  <span className="flex-1 text-gray-800 dark:text-gray-200">{WEIGHT_LABEL[k]}</span>
                  <button type="button" onClick={() => reorderPriority(i, -1)} disabled={i === 0}
                    className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => reorderPriority(i, 1)} disabled={i === order.length - 1}
                    className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↓</button>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Preview grouped by package/division */}
      <section>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Preview · {parsed.rows.length} players · {groups.length}{" "}
          {groups.length === 1 ? "division" : "divisions"}
        </h2>
        <div className="space-y-3">
          {groups.map(([pkg, recs]) => {
            const isOpen = expanded.has(pkg);
            const shown = isOpen ? recs : recs.slice(0, PREVIEW_LIMIT);
            const hasMore = recs.length > PREVIEW_LIMIT;
            return (
              <div key={pkg} className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleGroup(pkg)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                >
                  <span className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 12 12" className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">
                      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    <span className="font-semibold text-gray-900 dark:text-white">{pkg}</span>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {recs.length} {recs.length === 1 ? "player" : "players"}
                  </span>
                </button>
                <div className="relative">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-white dark:bg-gray-900">
                        <tr>
                          {previewCols.map((f) => (
                            <th key={f} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                              {FIELD_DEFS.find((d) => d.key === f)?.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {shown.map((rec, i) => (
                          <tr key={i} className="bg-white dark:bg-gray-900">
                            {previewCols.map((f) => {
                              const value = rec[f];
                              const blank = REQUEST_FIELDS.has(f) ? isNoRequest(value) : !value;
                              return (
                                <td key={f} className={`whitespace-nowrap px-3 py-2 ${blank ? "text-gray-300 dark:text-gray-600" : "text-gray-800 dark:text-gray-200"}`}>
                                  {blank ? "—" : value}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {hasMore && !isOpen && (
                    <div className="pointer-events-none absolute bottom-9 inset-x-0 h-10 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
                  )}
                  {hasMore && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(pkg)}
                      className="w-full px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800"
                    >
                      {isOpen ? "Show less" : `Show all ${recs.length} players`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
