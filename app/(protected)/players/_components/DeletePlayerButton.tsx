"use client";

import { useTransition } from "react";
import { deletePlayer } from "../actions";

export default function DeletePlayerButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    startTransition(async () => {
      await deletePlayer(id);
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="text-red-500 hover:underline disabled:opacity-50"
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
