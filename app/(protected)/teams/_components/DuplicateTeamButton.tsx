"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicateTeam } from "../actions";

export default function DuplicateTeamButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    startTransition(async () => {
      const result = await duplicateTeam(id);
      if (result.newId) {
        router.push(`/teams/${result.newId}/edit`);
      } else if (result.error) {
        alert(result.error);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="text-blue-600 hover:underline disabled:opacity-40"
    >
      {pending ? "Copying…" : "Duplicate"}
    </button>
  );
}
