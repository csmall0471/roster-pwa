"use client";

import { useState, useTransition } from "react";
import { savePlayerDob } from "../actions";

// Age on Aug 1, 2026 determines division for Fall 2026 + Spring 2027.
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
}: {
  playerId: string;
  dob: string | null;
}) {
  const [dob, setDob]         = useState(initialDob);
  const [input, setInput]     = useState("");
  const [error, setError]     = useState<string | null>(null);
  const [pending, startSave]  = useTransition();

  if (dob) {
    const age = ageOnCutoff(dob);
    const div = division(age);
    return (
      <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-800 bg-orange-50 dark:bg-orange-950/20 flex items-center gap-2">
        <span className="text-orange-500 text-sm">🏀</span>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-semibold text-orange-600 dark:text-orange-400">{div}</span>
          {" "}eligible — Fall 2026 &amp; Spring 2027
        </span>
        <span className="ml-auto text-xs text-gray-400 dark:text-gray-500">
          Age {age} on Aug 1
        </span>
      </div>
    );
  }

  return (
    <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 bg-orange-50 dark:bg-orange-950/20">
      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
        🏀 Enter birthday to see division eligibility
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
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-orange-400"
        />
        <button
          type="submit"
          disabled={pending || !input}
          className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium px-3 py-1.5 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </form>
    </div>
  );
}
