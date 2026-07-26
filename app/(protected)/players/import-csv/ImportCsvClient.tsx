"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  analyzeCsvImport,
  applyCsvImport,
  type ApplyCsvResult,
  type CsvImportPlan,
} from "./actions";

type Team = { id: string; name: string; season: string | null };

const STATUS_BADGE: Record<string, string> = {
  create: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  update: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  unchanged: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
  ambiguous: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export default function ImportCsvClient({ teams }: { teams: Team[] }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvText, setCsvText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<CsvImportPlan | null>(null);
  const [teamId, setTeamId] = useState("");
  const [result, setResult] = useState<ApplyCsvResult | null>(null);
  const [analyzing, startAnalyze] = useTransition();
  const [applying, startApply] = useTransition();

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(String(reader.result ?? ""));
      setPlan(null);
      setResult(null);
    };
    reader.readAsText(file);
  }

  function preview() {
    setResult(null);
    startAnalyze(async () => {
      const p = await analyzeCsvImport(csvText);
      setPlan(p);
      setTeamId(p.matchedTeamId ?? "");
    });
  }

  function apply() {
    startApply(async () => {
      const r = await applyCsvImport(csvText, teamId || null);
      setResult(r);
      setPlan(null);
    });
  }

  function reset() {
    setCsvText("");
    setFileName(null);
    setPlan(null);
    setResult(null);
    setTeamId("");
    if (fileRef.current) fileRef.current.value = "";
  }

  // ── Result screen ───────────────────────────────────────────────────────────
  if (result) {
    const ok = result.errors.length === 0;
    return (
      <div className="space-y-4">
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            ok
              ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300"
              : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300"
          }`}
        >
          <p className="font-semibold">
            ✓ {result.created} created · {result.updated} updated · {result.unchanged} unchanged
            {result.addedToTeam > 0 && ` · ${result.addedToTeam} added to team`}
            {result.skipped > 0 && ` · ${result.skipped} skipped`}
          </p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc space-y-0.5 pl-4">
              {result.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex gap-3">
          <Link
            href="/players"
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View players →
          </Link>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Import another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* File / paste input */}
      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Choose CSV file
          </button>
          {fileName && <span className="text-sm text-gray-500 dark:text-gray-400">{fileName}</span>}
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={pickFile} className="hidden" />
        </div>

        <div className="text-center text-xs text-gray-400">— or paste —</div>

        <textarea
          value={csvText}
          onChange={(e) => {
            setCsvText(e.target.value);
            setPlan(null);
            setFileName(null);
          }}
          rows={6}
          placeholder="Paste CSV text (including the header row)…"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />

        <button
          type="button"
          onClick={preview}
          disabled={!csvText.trim() || analyzing}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {analyzing ? "Reading…" : "Preview import"}
        </button>
      </div>

      {/* Plan */}
      {plan && (
        <div className="space-y-4">
          {plan.errors.length > 0 && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <ul className="list-disc space-y-0.5 pl-4">
                {plan.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.rows.length > 0 && (
            <>
              {/* Summary chips */}
              <div className="flex flex-wrap gap-2 text-sm">
                <Chip n={plan.counts.create} label="new" cls={STATUS_BADGE.create} />
                <Chip n={plan.counts.update} label="to update" cls={STATUS_BADGE.update} />
                <Chip n={plan.counts.unchanged} label="unchanged" cls={STATUS_BADGE.unchanged} />
                {plan.counts.ambiguous > 0 && (
                  <Chip n={plan.counts.ambiguous} label="need attention" cls={STATUS_BADGE.ambiguous} />
                )}
              </div>

              {/* Team placement */}
              <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200">
                  Add these players to a team
                </label>
                {plan.teamName && (
                  <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
                    The file lists “{plan.teamName}”.
                    {plan.matchedTeamId ? " Matched to your team below." : " No matching team found — pick one or skip."}
                  </p>
                )}
                <select
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white sm:max-w-sm"
                >
                  <option value="">Don&apos;t add to a team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.season ? ` · ${t.season}` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row table */}
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-800">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left dark:border-gray-800 dark:bg-gray-900/60">
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Player</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 dark:text-gray-300">Changes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.row} className="border-b border-gray-100 last:border-0 dark:border-gray-800/60">
                        <td className="whitespace-nowrap px-3 py-1.5 font-medium text-gray-900 dark:text-white">
                          {r.name}
                        </td>
                        <td className="px-3 py-1.5">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                          {r.note ?? (r.changes.length ? r.changes.join(", ") : "—")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={apply}
                  disabled={applying || (plan.counts.create + plan.counts.update === 0 && !teamId)}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying
                    ? "Applying…"
                    : `Apply — ${plan.counts.create} new, ${plan.counts.update} updated`}
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <span className={`rounded-full px-3 py-1 font-medium ${cls}`}>
      {n} {label}
    </span>
  );
}
