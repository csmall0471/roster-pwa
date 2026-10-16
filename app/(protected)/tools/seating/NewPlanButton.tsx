"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPlan } from "./actions";

// Creates a plan (pre-seeded with the default lounge layout) and jumps straight
// into its editor.
export default function NewPlanButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    const title = window.prompt("Name this seating plan…", "Suns Game");
    if (title === null) return; // cancelled
    setBusy(true);
    setError(null);
    const res = await createPlan(title);
    if (res.id) {
      router.push(`/tools/seating/${res.id}`);
      return;
    }
    setError(res.error ?? "Failed to create the plan.");
    setBusy(false);
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={create}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? "Creating…" : (
          <>
            <span className="text-base leading-none">+</span> New plan
          </>
        )}
      </button>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
