"use client";

import { useState, useTransition } from "react";
import { savePlayerDob } from "../actions";

const CUTOFF = new Date("2026-08-01T00:00:00");

function ageOnCutoff(dob: string): number {
  const birth = new Date(dob + "T00:00:00");
  let age = CUTOFF.getFullYear() - birth.getFullYear();
  const m = CUTOFF.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && CUTOFF.getDate() < birth.getDate())) age--;
  return age;
}

function division(age: number): string {
  return `${Math.ceil(age / 2) * 2}U`;
}

export default function EligibilityBar({
  playerId,
  dob: initialDob,
  playerName = "",
}: {
  playerId: string;
  dob: string | null;
  playerName?: string;
}) {
  const [dob, setDob]        = useState(initialDob);
  const [input, setInput]    = useState("");
  const [error, setError]    = useState<string | null>(null);
  const [pending, startSave] = useTransition();
  const [expanded, setExpanded] = useState(false);

  if (dob) {
    const age = ageOnCutoff(dob);
    const div = division(age);
    return (
      <div className="border-t border-gray-100 dark:border-gray-800">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-5 py-2.5 bg-green-50 dark:bg-green-950/20 flex items-center gap-2 text-left hover:bg-green-100 dark:hover:bg-green-950/30 transition-colors"
        >
          <span className="text-sm">🏈</span>
          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
            <span className="font-semibold text-green-700 dark:text-green-400">{div}</span>
            {" "}eligible — CCV Flag Football
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
            Age {age} on Aug 1 {expanded ? "▲" : "▼"}
          </span>
        </button>
        {expanded && (
          <div className="px-5 py-3 bg-green-50 dark:bg-green-950/20 border-t border-green-100 dark:border-green-900/30 space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              CCV determines division eligibility based on a player&apos;s age on{" "}
              <strong className="text-gray-700 dark:text-gray-300">August 1, 2026</strong>,
              covering both the Fall 2026 and Spring 2027 seasons.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {playerName && (
                <><strong className="text-gray-800 dark:text-gray-200">{playerName}</strong> will be </>
              )}
              <strong className="text-gray-800 dark:text-gray-200">{age} years old</strong> on August 1 —
              eligible for the{" "}
              <strong className="text-green-700 dark:text-green-400">{div} division</strong>.
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 pt-1 border-t border-green-100 dark:border-green-900/30">
              <strong className="text-gray-700 dark:text-gray-300">Playing up:</strong> Players may
              choose to play up one division (e.g., {div} → {`${Math.ceil(age / 2) * 2 + 2}U`}) if
              they prefer a greater challenge. Playing down to a younger division is not permitted.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-green-50 dark:bg-green-950/20">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        🏈 Enter birthday to see CCV Flag Football division eligibility
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!input) return;
          setError(null);
          startSave(async () => {
            const result = await savePlayerDob(playerId, input);
            if (result.error) { setError(result.error); return; }
            setDob(input);
          });
        }}
        className="flex gap-2 items-center"
      >
        <input
          type="date"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          required
          max={new Date().toISOString().split("T")[0]}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-green-500"
        />
        <button
          type="submit"
          disabled={pending || !input}
          className="rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-3 py-1.5 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>
    </div>
  );
}
