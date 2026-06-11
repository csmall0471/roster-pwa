"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAllSeasons } from "./actions";

export default function DeleteAllSeasonsButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function del() {
    if (
      !confirm(
        `Delete ALL ${count} season${count === 1 ? "" : "s"} and everything in them ` +
          `(divisions, teams, coaches, and players)?\n\nThis cannot be undone.`
      )
    )
      return;
    setBusy(true);
    try {
      const res = await deleteAllSeasons();
      if (!res.ok) {
        alert(res.error ?? "Failed to delete seasons.");
        setBusy(false);
        return;
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete seasons.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={del}
      disabled={busy}
      className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete all"}
    </button>
  );
}
