"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { cancelSnackSlot } from "@/app/(protected)/teams/schedule-actions";

export type SnackDashGame = {
  id: string;
  game_date: string;
  game_time: string | null;
  opponent: string | null;
  is_home: boolean;
  team_id: string;
  team_name: string;
  slots_per_game: number;
  signups: Array<{
    id: string;
    parent_id: string;
    parents: { first_name: string; last_name: string } | null;
  }>;
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

export default function SnackDashboard({
  initialGames,
  parentId,
}: {
  initialGames: SnackDashGame[];
  parentId: string;
}) {
  const [games, setGames] = useState(initialGames);

  function onCancel(gameId: string, signupId: string) {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId ? { ...g, signups: g.signups.filter((s) => s.id !== signupId) } : g
      )
    );
  }

  // Group by team. Per team: show signed-up game rows OR one sign-up prompt.
  const teamBuckets = useMemo(() => {
    const map = new Map<string, SnackDashGame[]>();
    for (const g of games) {
      if (!map.has(g.team_id)) map.set(g.team_id, []);
      map.get(g.team_id)!.push(g);
    }
    return Array.from(map.values())
      .map((teamGames) => {
        const myGames   = teamGames.filter((g) => g.signups.some((s) => s.parent_id === parentId));
        const openGames = teamGames.filter(
          (g) => !g.signups.some((s) => s.parent_id === parentId) && g.signups.length < g.slots_per_game
        );
        return { teamId: teamGames[0].team_id, teamName: teamGames[0].team_name, myGames, openGames };
      })
      .filter((b) => b.myGames.length > 0 || b.openGames.length > 0);
  }, [games, parentId]);

  if (teamBuckets.length === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Upcoming Snack Duties
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
        {teamBuckets.map((bucket) =>
          bucket.myGames.length > 0
            ? bucket.myGames.map((g) => (
                <SignedUpRow
                  key={g.id}
                  game={g}
                  parentId={parentId}
                  onCancel={(sid) => onCancel(g.id, sid)}
                />
              ))
            : (
                <TeamSignupPrompt
                  key={bucket.teamId}
                  teamId={bucket.teamId}
                  teamName={bucket.teamName}
                  openCount={bucket.openGames.length}
                />
              )
        )}
      </div>
    </section>
  );
}

function SignedUpRow({
  game, parentId, onCancel,
}: {
  game: SnackDashGame;
  parentId: string;
  onCancel: (signupId: string) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start]  = useTransition();
  const mySignup          = game.signups.find((s) => s.parent_id === parentId)!;
  const time              = fmtTime(game.game_time);

  function handleCancel() {
    if (!confirm("Cancel your snack signup?")) return;
    start(async () => {
      const result = await cancelSnackSlot(mySignup.id);
      if (result.error) { setError(result.error); return; }
      onCancel(mySignup.id);
    });
  }

  return (
    <div className="px-5 py-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/parent/team/${game.team_id}?tab=schedule`}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
          >
            {game.team_name}
          </Link>
          <div className="flex items-baseline gap-2 flex-wrap mt-0.5">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {fmtDate(game.game_date)}
            </span>
            {time && <span className="text-xs text-gray-400 dark:text-gray-500">{time}</span>}
            {game.opponent && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {game.is_home ? "vs" : "@"} {game.opponent}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs font-semibold text-green-700 dark:text-green-400">
            ✓ You&apos;re signed up
          </span>
          <button
            onClick={handleCancel}
            disabled={pending}
            className="text-xs text-red-500 hover:underline disabled:opacity-50"
          >
            {pending ? "…" : "Cancel"}
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

function TeamSignupPrompt({
  teamId, teamName, openCount,
}: {
  teamId: string;
  teamName: string;
  openCount: number;
}) {
  return (
    <div className="px-5 py-3 flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-gray-900 dark:text-white">{teamName}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {openCount === 1 ? "1 game needs snack coverage" : `${openCount} games need snack coverage`}
        </p>
      </div>
      <Link
        href={`/parent/team/${teamId}?tab=schedule`}
        className="shrink-0 rounded-lg border border-green-300 dark:border-green-700 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors whitespace-nowrap"
      >
        Sign up →
      </Link>
    </div>
  );
}
