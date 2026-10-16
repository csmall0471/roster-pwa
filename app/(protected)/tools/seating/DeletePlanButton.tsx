"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePlan } from "./actions";

// Row-level "delete this seating plan" control for the plans list. Confirms
// (the plan's layout, people, assignments, and picks all go with it — the
// linked event itself is untouched), then deletes and refreshes the list.
export default function DeletePlanButton({
  planId,
  title,
}: {
  planId: string;
  title: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleDelete() {
    if (
      !window.confirm(
        `Delete "${title}"? The layout, people list, seat assignments, and sit-by picks in this plan are removed. (A linked event and its RSVPs are NOT touched.)`
      )
    )
      return;
    setError(null);
    start(async () => {
      const res = await deletePlan(planId);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="shrink-0">
      <button
        type="button"
        onClick={handleDelete}
        disabled={pending}
        className="rounded-md px-2 py-1 text-xs font-medium text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/40 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
        aria-label={`Delete ${title}`}
        title="Delete plan"
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      {error && <span className="ml-1 text-xs text-red-500">{error}</span>}
    </span>
  );
}
