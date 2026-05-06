"use client";

import { useActionState } from "react";
import Link from "next/link";
import { importPlayers, type ImportResult } from "./actions";

export default function ImportPlayersPage() {
  const [result, formAction, pending] = useActionState<ImportResult, FormData>(
    importPlayers,
    null
  );

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <Link href="/players" className="text-sm text-blue-600 hover:underline">
          ← Back to players
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-3">Import players</h1>
        <p className="text-sm text-gray-500 mt-1">
          Copy your spreadsheet (Ctrl+A → Ctrl+C) and paste it below. Expected column order:
        </p>
        <p className="text-xs font-mono bg-gray-50 border border-gray-200 rounded px-3 py-2 mt-2 text-gray-600 overflow-x-auto whitespace-nowrap">
          First Name · Last Name · DOB · Grade · Team · Shirt Size · P1 Name · P1 Phone · P1 Email · P2 Name · P2 Phone · P2 Email
        </p>
        <ul className="text-xs text-gray-400 mt-2 space-y-0.5 list-disc pl-4">
          <li>Header row is detected and skipped automatically.</li>
          <li>Team column is ignored — assign players to teams via the Teams page.</li>
          <li>Parents are deduplicated by email, so siblings (e.g. two kids with the same parent email) share one parent record.</li>
        </ul>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {result?.imported != null && result.imported > 0 ? (
          <div className="space-y-3">
            <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
              <p className="font-semibold">
                ✓ Imported {result.imported} player{result.imported !== 1 ? "s" : ""}
              </p>
              {result.errors.length > 0 && (
                <div className="mt-2">
                  <p className="font-medium text-amber-700">
                    {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped:
                  </p>
                  <ul className="list-disc pl-4 mt-1 space-y-0.5 text-amber-700">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <Link
              href="/players"
              className="inline-block rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
            >
              View player directory →
            </Link>
          </div>
        ) : (
          <form action={formAction} className="space-y-4">
            <div>
              <label htmlFor="tsv" className="block text-sm font-medium text-gray-700 mb-1">
                Paste spreadsheet data
              </label>
              <textarea
                id="tsv"
                name="tsv"
                rows={14}
                required
                placeholder="Paste tab-separated data from Google Sheets or Excel here…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {result?.errors && result.errors.length > 0 && result.imported === 0 && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
                <ul className="list-disc pl-4 space-y-0.5">
                  {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Importing…" : "Import players"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
