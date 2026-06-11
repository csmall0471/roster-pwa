"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  addCoachTeam,
  addDivision,
  addPlaceholderTeam,
  addRosterToSeason,
  deleteDivision,
  deleteTeam,
  renameDivision,
  setTeamPracticeNight,
  updateTeamCoach,
} from "../../actions";
import { NIGHTS } from "../../group/engine";
import { parseCoachWorkbook } from "../../coach-roster";

export type EditorTeam = { id: string; coachName: string; isPlaceholder: boolean; night: string | null };
export type EditorDivision = { id: string; name: string; teams: EditorTeam[] };

export default function StructureEditor({
  seasonId,
  divisions,
}: {
  seasonId: string;
  divisions: EditorDivision[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newDiv, setNewDiv] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    setBusy(true);
    setError(null);
    try {
      const parsed = await parseCoachWorkbook(file);
      if (parsed.divisions.length === 0) throw new Error("Couldn't find any divisions/sheets in that workbook.");
      await addRosterToSeason(
        seasonId,
        parsed.divisions.map((d) => ({
          name: d.name,
          targetTeamSize: 12,
          teams: d.teams.map((t) => ({
            coachName: t.coachName,
            isPlaceholder: t.isPlaceholder,
            rawLabel: t.rawLabel,
          })),
        }))
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read the workbook.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const totalTeams = divisions.reduce((n, d) => n + d.teams.length, 0);

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:border-gray-400 disabled:opacity-50"
        >
          ⬆ Upload coaches file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleUpload(f);
          }}
        />
        <span className="text-xs text-gray-400">
          One sheet per division, one row per team (coach name, or &ldquo;Team N&rdquo; for an open slot).
        </span>
        {busy && <span className="text-xs text-blue-500">working…</span>}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Divisions — side by side to cut down on scrolling */}
      {divisions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          No divisions yet — add one below or upload a coaches file.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
          {divisions.map((d) => (
            <DivisionCard key={d.id} seasonId={seasonId} division={d} busy={busy} run={run} />
          ))}
        </div>
      )}

      {/* Add division */}
      <div className="flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Add a division</span>
          <input
            value={newDiv}
            onChange={(e) => setNewDiv(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newDiv.trim()) {
                const name = newDiv.trim();
                setNewDiv("");
                run(() => addDivision(seasonId, name));
              }
            }}
            placeholder="e.g. 10u Boys"
            className="w-56 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          />
        </label>
        <button
          type="button"
          disabled={busy || !newDiv.trim()}
          onClick={() => {
            const name = newDiv.trim();
            setNewDiv("");
            run(() => addDivision(seasonId, name));
          }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Add division
        </button>
      </div>

      {/* Continue */}
      <div className="sticky bottom-0 -mx-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50/95 dark:bg-gray-950/95 px-4 py-3 backdrop-blur flex items-center gap-3">
        <Link
          href={`/tools/roster-creator/${seasonId}/players`}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Continue to players →
        </Link>
        <span className="text-xs text-gray-400">
          {divisions.length} divisions · {totalTeams} teams
        </span>
      </div>
    </div>
  );
}

function DivisionCard({
  seasonId,
  division,
  busy,
  run,
}: {
  seasonId: string;
  division: EditorDivision;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [newCoach, setNewCoach] = useState("");
  const coached = division.teams.filter((t) => !t.isPlaceholder).length;
  const open = division.teams.length - coached;

  function addCoach() {
    const name = newCoach.trim();
    if (!name) return;
    setNewCoach("");
    run(() => addCoachTeam(seasonId, division.id, name));
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50">
        <input
          defaultValue={division.name}
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== division.name) run(() => renameDivision(seasonId, division.id, v));
          }}
          className="w-28 sm:w-36 shrink-0 bg-transparent font-semibold text-gray-900 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 py-0.5"
        />
        <span className="min-w-0 truncate text-xs text-gray-500 dark:text-gray-400">
          {division.teams.length} teams · {coached} coached · {open} open
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete division “${division.name}” and its teams? Players in it become unassigned.`))
              run(() => deleteDivision(seasonId, division.id));
          }}
          className="ml-auto shrink-0 text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
          title="Delete division"
        >
          Delete
        </button>
      </div>

      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
        {division.teams.map((t) => (
          <li key={t.id} className="flex items-center gap-2 px-4 py-2">
            <input
              defaultValue={t.coachName}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v !== t.coachName) run(() => updateTeamCoach(seasonId, t.id, v));
              }}
              placeholder="open slot — type a coach name"
              className={`flex-1 min-w-0 rounded-md border px-2 py-1 text-sm bg-white dark:bg-gray-950 ${
                t.isPlaceholder
                  ? "border-dashed border-gray-300 dark:border-gray-700 text-gray-500 placeholder-gray-400"
                  : "border-gray-300 dark:border-gray-700 text-gray-900 dark:text-gray-100"
              }`}
            />
            <select
              value={t.night ?? ""}
              disabled={busy}
              onChange={(e) => run(() => setTeamPracticeNight(seasonId, t.id, e.target.value || null))}
              className="shrink-0 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs text-gray-600 dark:text-gray-300"
              title="Practice day"
            >
              <option value="">— day —</option>
              {NIGHTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => deleteTeam(seasonId, t.id))}
              className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
              title="Remove team"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800">
        <input
          value={newCoach}
          onChange={(e) => setNewCoach(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCoach()}
          placeholder="Add a coach"
          className="w-48 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
        />
        <button
          type="button"
          disabled={busy || !newCoach.trim()}
          onClick={addCoach}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Coach
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => addPlaceholderTeam(seasonId, division.id))}
          className="rounded-md border border-gray-300 dark:border-gray-700 px-2.5 py-1 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:border-gray-400 disabled:opacity-50"
        >
          + Open slot
        </button>
      </div>
    </div>
  );
}
