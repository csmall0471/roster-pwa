"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import SnackSchedule, { type SnackGameRow } from "./SnackSchedule";

export type RosterEntry = {
  player_id: string;
  first_name: string;
  last_name: string;
  jersey_number: number | null;
  status: string;
  photo_url: string | null;
};

function PlayerCard({
  entry,
  isMyKid,
}: {
  entry: RosterEntry;
  isMyKid: boolean;
}) {
  const name = `${entry.first_name} ${entry.last_name}`;
  const inner = (
    <div className={`relative rounded-xl overflow-hidden border ${isMyKid ? "border-blue-400 dark:border-blue-500" : "border-gray-200 dark:border-gray-700"}`}>
      <div className="relative aspect-[5/7] bg-gray-100 dark:bg-gray-800">
        {entry.photo_url ? (
          <Image
            src={entry.photo_url}
            alt={name}
            width={200}
            height={280}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600 text-4xl">
            👤
          </div>
        )}
        {isMyKid && (
          <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
            MY KID
          </span>
        )}
        {entry.jersey_number != null && (
          <span className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full">
            #{entry.jersey_number}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">
        <p className={`text-xs font-medium truncate ${isMyKid ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>
          {name}
        </p>
      </div>
    </div>
  );

  if (isMyKid) {
    return (
      <Link href={`/parent/player/${entry.player_id}`} className="block hover:opacity-90 transition-opacity">
        {inner}
      </Link>
    );
  }
  return inner;
}

export default function TeamTabs({
  teamId,
  initialTab,
  active,
  inactive,
  myKidIds,
  games,
  slotsPerGame,
  parentId,
  teamName,
  snackEnabled,
}: {
  teamId: string;
  initialTab: string;
  active: RosterEntry[];
  inactive: RosterEntry[];
  myKidIds: string[];
  games: SnackGameRow[];
  slotsPerGame: number;
  parentId: string;
  teamName: string;
  snackEnabled: boolean;
}) {
  const [tab, setTab] = useState(initialTab);
  const mySet = new Set(myKidIds);

  const tabCls = (name: string) =>
    `px-4 py-2 text-sm -mb-px cursor-pointer transition-colors ${
      tab === name
        ? "border-b-2 border-blue-600 text-blue-600 dark:text-blue-400 font-semibold bg-blue-50 dark:bg-blue-950/40 rounded-t-md"
        : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
    }`;

  return (
    <>
      {/* Tab nav */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 mb-6">
        <button onClick={() => setTab("roster")} className={tabCls("roster")}>
          Roster ({active.length})
        </button>
        <button onClick={() => setTab("schedule")} className={tabCls("schedule")}>
          {snackEnabled ? "Schedule & Snacks" : "Schedule"}
          {games.length > 0 ? ` (${games.length})` : ""}
        </button>
      </div>

      {tab === "roster" && (
        <>
          <section>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {active.map((entry) => (
                <PlayerCard key={entry.player_id} entry={entry} isMyKid={mySet.has(entry.player_id)} />
              ))}
            </div>
          </section>

          {inactive.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Inactive
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 opacity-50">
                {inactive.map((entry) => (
                  <PlayerCard key={entry.player_id} entry={entry} isMyKid={mySet.has(entry.player_id)} />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === "schedule" && (
        games.length > 0 ? (
          <SnackSchedule
            initialGames={games}
            slotsPerGame={slotsPerGame}
            parentId={parentId}
            teamName={teamName}
            snackEnabled={snackEnabled}
          />
        ) : (
          <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-12">
            No games scheduled yet.
          </p>
        )
      )}
    </>
  );
}
