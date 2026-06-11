"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSeason } from "./actions";

export default function DeleteSeasonButton({
  seasonId,
  seasonName,
}: {
  seasonId: string;
  seasonName: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function onDelete() {
    const ok = window.confirm(
      `Delete "${seasonName}"?\n\nThis permanently removes its divisions, players, teams, and schedule. This cannot be undone.`
    );
    if (!ok) return;
    start(async () => {
      try {
        await deleteSeason(seasonId);
        router.refresh();
      } catch {
        window.alert("Failed to delete the season.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={pending}
      aria-label={`Delete ${seasonName}`}
      className="shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
