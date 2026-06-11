import Link from "next/link";
import { Fragment } from "react";

export type Step = "setup" | "players" | "build";

const STEPS: { key: Step; n: number; label: string; path: string }[] = [
  { key: "setup", n: 1, label: "Structure", path: "setup" },
  { key: "players", n: 2, label: "Players", path: "players" },
  { key: "build", n: 3, label: "Build teams", path: "confirm" },
];

// The setup-wizard progress bar. `current` highlights the active step; earlier
// steps are clickable to go back, the active one is bold, later ones are muted.
export default function Stepper({ seasonId, current }: { seasonId: string; current: Step }) {
  const activeIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
      {STEPS.map((s, i) => {
        const state = i < activeIdx ? "done" : i === activeIdx ? "active" : "todo";
        const badge =
          state === "active"
            ? "bg-blue-600 text-white"
            : state === "done"
              ? "bg-green-600 text-white"
              : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400";
        const text =
          state === "active"
            ? "text-gray-900 dark:text-white font-semibold"
            : "text-gray-500 dark:text-gray-400";
        return (
          <Fragment key={s.key}>
            <Link
              href={`/tools/roster-creator/${seasonId}/${s.path}`}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${badge}`}>
                {s.n}
              </span>
              <span className={text}>{s.label}</span>
            </Link>
            {i < STEPS.length - 1 && <span className="text-gray-300 dark:text-gray-600">—</span>}
          </Fragment>
        );
      })}
    </nav>
  );
}
