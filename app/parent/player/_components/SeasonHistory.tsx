"use client";

import { useState } from "react";

type SeasonRow = {
  jersey_number: number | null;
  status: string;
  teams: {
    id: string;
    name: string;
    sport: string | null;
    season: string | null;
    age_group: string | null;
    organization: string | null;
  };
};

const INITIAL_LIMIT = 3;

export default function SeasonHistory({ seasons }: { seasons: SeasonRow[] }) {
  const [expanded, setExpanded] = useState(false);

  const visible = expanded ? seasons : seasons.slice(0, INITIAL_LIMIT);
  const hidden = seasons.length - INITIAL_LIMIT;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
      {visible.map((row, i) => {
        const t = row.teams;
        const meta = [t.organization, t.sport, t.age_group, t.season].filter(Boolean).join(" · ");
        return (
          <div key={i} className="px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">{t.name}</p>
              {meta && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{meta}</p>}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {row.jersey_number != null && (
                <span className="text-xs font-mono text-gray-500 dark:text-gray-400">#{row.jersey_number}</span>
              )}
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                row.status === "active"
                  ? "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
              }`}>
                {row.status}
              </span>
            </div>
          </div>
        );
      })}

      {hidden > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-4 py-2.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors text-center"
        >
          {expanded ? "Show less" : `Show ${hidden} more season${hidden !== 1 ? "s" : ""}`}
        </button>
      )}
    </div>
  );
}
