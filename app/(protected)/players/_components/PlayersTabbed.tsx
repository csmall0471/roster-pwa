"use client";

import { useState } from "react";
import type { PlayerWithParents, RankPlayer, RatingValues } from "@/lib/types";
import PlayerDirectory from "./PlayerDirectory";
import PlayerRanking from "./PlayerRanking";

type Tab = "directory" | "ranking";

export default function PlayersTabbed({
  players,
  primaryPhotos,
  teams,
  rankPlayers,
  ratings,
}: {
  players: PlayerWithParents[];
  primaryPhotos: Record<string, string>;
  teams: { id: string; name: string; season: string }[];
  rankPlayers: RankPlayer[];
  ratings: Record<string, RatingValues>;
}) {
  const [tab, setTab] = useState<Tab>("directory");

  const tabClass = (t: Tab) =>
    `-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
      tab === t
        ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
        : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600"
    }`;

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-5">
        <button type="button" onClick={() => setTab("directory")} className={tabClass("directory")}>
          Directory
        </button>
        <button type="button" onClick={() => setTab("ranking")} className={tabClass("ranking")}>
          Ranking
        </button>
      </div>

      {tab === "directory" ? (
        <PlayerDirectory players={players} primaryPhotos={primaryPhotos} teams={teams} />
      ) : (
        <PlayerRanking players={rankPlayers} initialRatings={ratings} />
      )}
    </div>
  );
}
