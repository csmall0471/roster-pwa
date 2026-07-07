"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteCardDraft } from "./draft-actions";

export type DraftRow = {
  id: string;
  label: string | null;
  team_name: string | null;
  season: string | null;
  front_url: string | null;
  updated_at: string;
  // Set when the draft is earmarked for a kid (still off their profile).
  player_name?: string | null;
};

export default function DraftsList({
  drafts,
  activeId,
}: {
  drafts: DraftRow[];
  activeId: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (drafts.length === 0) return null;

  function remove(id: string) {
    start(async () => {
      await deleteCardDraft(id);
      if (id === activeId) router.push("/tools/card-creator");
      else router.refresh();
    });
  }

  return (
    <div className="mt-10">
      <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Drafts <span className="text-gray-400">({drafts.length})</span>
      </h2>
      <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {drafts.map((d) => (
          <li
            key={d.id}
            className={`rounded-xl border p-2 bg-white dark:bg-gray-900 ${
              d.id === activeId
                ? "border-blue-500 ring-1 ring-blue-500"
                : "border-gray-200 dark:border-gray-800"
            }`}
          >
            <Link href={`/tools/card-creator?draft=${d.id}`} className="block">
              <div className="relative">
                {d.front_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.front_url}
                    alt=""
                    className="w-full aspect-[5/7] object-cover rounded-lg bg-gray-100 dark:bg-gray-800"
                  />
                ) : (
                  <div className="w-full aspect-[5/7] rounded-lg bg-gray-100 dark:bg-gray-800" />
                )}
                {d.player_name && (
                  <span className="absolute top-1.5 left-1.5 max-w-[85%] truncate rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    For {d.player_name}
                  </span>
                )}
              </div>
              <div className="mt-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                {d.label || "Untitled"}
              </div>
              <div className="text-[11px] text-gray-400 truncate">
                {[d.team_name, d.season].filter(Boolean).join(" · ") || "—"}
              </div>
            </Link>
            <button
              onClick={() => remove(d.id)}
              disabled={pending}
              className="mt-1 text-[11px] font-medium text-gray-400 hover:text-red-600 disabled:opacity-50"
            >
              Delete
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
