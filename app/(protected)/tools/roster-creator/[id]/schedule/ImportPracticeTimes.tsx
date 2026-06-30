"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { NIGHTS } from "../../group/engine";
import { fmtTime } from "../../schedule";
import { fetchPracticeSheetCsv, applyPracticeTimes } from "../../actions";
import {
  parsePracticeGrid,
  matchPracticeSlots,
  type PracticeSlot,
  type TeamLite,
} from "../../practice-import";
import type { SchedTeam } from "./ScheduleBoard";

type ReviewRow = {
  teamId: string;
  teamName: string;
  divisionName: string;
  curDay: string | null;
  curTime: string | null;
  day: string | null;
  time: string | null;
  sourceLabel: string;
  apply: boolean;
};

type Result = {
  rows: ReviewRow[];
  unmatched: PracticeSlot[];
  slotCount: number;
};

export default function ImportPracticeTimes({
  seasonId,
  teams,
  divisions,
}: {
  seasonId: string;
  teams: SchedTeam[];
  divisions: { id: string; name: string }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const divName = useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);

  function handleMatrix(matrix: string[][]) {
    const slots = parsePracticeGrid(matrix);
    if (slots.length === 0) {
      setError(
        "Couldn't find a practice grid (a row with weekday names, then time + coach columns). Check the tab."
      );
      setResult(null);
      return;
    }
    const lite: TeamLite[] = teams.map((t) => ({
      id: t.id,
      coach: t.coach,
      divisionName: divName.get(t.divisionId) ?? "",
    }));
    const matches = matchPracticeSlots(lite, slots);

    const rows: ReviewRow[] = [];
    for (const t of teams) {
      const m = matches.get(t.id);
      if (!m) continue;
      rows.push({
        teamId: t.id,
        teamName: t.name,
        divisionName: divName.get(t.divisionId) ?? "",
        curDay: t.day,
        curTime: t.time,
        day: m.slot.day,
        time: m.slot.time,
        sourceLabel: m.slot.label,
        apply: true,
      });
    }
    rows.sort((a, b) => a.divisionName.localeCompare(b.divisionName) || a.teamName.localeCompare(b.teamName));

    const usedSlots = new Set<PracticeSlot>([...matches.values()].map((m) => m.slot));
    const unmatched = slots.filter((s) => !usedSlots.has(s));

    setError(null);
    setDone(null);
    setResult({ rows, unmatched, slotCount: slots.length });
  }

  async function fetchUrl() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const res = await fetchPracticeSheetCsv(url);
      if (res.error || !res.csv) {
        setError(res.error ?? "No data returned.");
        return;
      }
      const wb = XLSX.read(res.csv, { type: "string", raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      handleMatrix(matrix);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the sheet.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(file: File) {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "" });
      handleMatrix(matrix);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the file.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function patchRow(teamId: string, patch: Partial<ReviewRow>) {
    setResult((r) =>
      r ? { ...r, rows: r.rows.map((row) => (row.teamId === teamId ? { ...row, ...patch } : row)) } : r
    );
  }

  async function apply() {
    if (!result) return;
    const assignments = result.rows
      .filter((r) => r.apply && r.day)
      .map((r) => ({ teamId: r.teamId, day: r.day, time: r.time }));
    if (assignments.length === 0) {
      setError("Nothing checked to apply.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const res = await applyPracticeTimes(seasonId, assignments);
      if (res.error) {
        setError(res.error);
        return;
      }
      setResult(null);
      setUrl("");
      setDone(`Applied ${res.count} practice time${res.count === 1 ? "" : "s"}.`);
      router.refresh();
    } finally {
      setApplying(false);
    }
  }

  const checkedCount = result?.rows.filter((r) => r.apply && r.day).length ?? 0;

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          Import practice times{" "}
          <span className="font-normal text-gray-400">from a Google Sheet</span>
        </span>
        <span className="text-gray-400">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 px-4 py-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Paste a Google Sheets link (Share → Anyone with the link → Viewer) or upload a CSV/Excel
            export. We&rsquo;ll read the day &amp; time grid and match each row to a team by coach and age
            group, then you review before applying.
          </p>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1 min-w-[220px]">
              <span className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">
                Google Sheet link
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && fetchUrl()}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={fetchUrl}
              disabled={busy || !url.trim()}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Reading…" : "Fetch"}
            </button>
            <span className="text-xs text-gray-400">or</span>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              Upload file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
          </div>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {done && <p className="text-sm text-green-600 dark:text-green-400">{done}</p>}

          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-gray-700 dark:text-gray-200">
                  Matched <span className="font-semibold">{result.rows.length}</span> team
                  {result.rows.length === 1 ? "" : "s"} from {result.slotCount} sheet rows.
                </p>
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying || checkedCount === 0}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying ? "Applying…" : `Apply ${checkedCount} practice time${checkedCount === 1 ? "" : "s"}`}
                </button>
              </div>

              {result.rows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-800">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-950 text-[11px] uppercase tracking-wide text-gray-400">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-semibold w-8"></th>
                        <th className="px-2 py-1.5 text-left font-semibold">Team</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Day</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Time</th>
                        <th className="px-2 py-1.5 text-left font-semibold">From sheet</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {result.rows.map((r) => (
                        <tr key={r.teamId} className={r.apply ? "" : "opacity-50"}>
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={r.apply}
                              onChange={(e) => patchRow(r.teamId, { apply: e.target.checked })}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <div className="font-medium text-gray-900 dark:text-gray-100">{r.teamName}</div>
                            <div className="text-[11px] text-gray-400">
                              {r.divisionName}
                              {r.curDay && (
                                <> · now {r.curDay.slice(0, 3)} {r.curTime ? fmtTime(r.curTime) : ""}</>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-1.5">
                            <select
                              value={r.day ?? ""}
                              onChange={(e) => patchRow(r.teamId, { day: e.target.value || null })}
                              className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-1 text-xs"
                            >
                              <option value="">—</option>
                              {NIGHTS.map((d) => (
                                <option key={d} value={d}>
                                  {d}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              type="time"
                              value={r.time ?? ""}
                              onChange={(e) => patchRow(r.teamId, { time: e.target.value || null })}
                              className="rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-1.5 py-1 text-xs"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-xs text-gray-500 dark:text-gray-400">
                            {r.sourceLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {result.unmatched.length > 0 && (
                <details className="rounded-md border border-gray-200 dark:border-gray-800 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-gray-600 dark:text-gray-300">
                    {result.unmatched.length} sheet row{result.unmatched.length === 1 ? "" : "s"} didn&rsquo;t
                    match a team
                  </summary>
                  <ul className="mt-2 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                    {result.unmatched.map((s, i) => (
                      <li key={i}>
                        {s.day.slice(0, 3)} {s.time ? fmtTime(s.time) : "—"} · {s.label}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-gray-400">
                    These are usually coaches/teams not in this season, or names spelled differently than
                    the requests. Place those by dragging on the board.
                  </p>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
