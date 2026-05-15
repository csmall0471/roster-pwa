"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { claimSnackSlot, cancelSnackSlot } from "@/app/(protected)/teams/schedule-actions";

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
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export default function SnackDashboard({
  initialGames,
  parentId,
}: {
  initialGames: SnackDashGame[];
  parentId: string;
}) {
  const [games, setGames] = useState(initialGames);

  if (games.length === 0) return null;

  function onSignup(gameId: string, signupId: string) {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId
          ? { ...g, signups: [...g.signups, { id: signupId, parent_id: parentId, parents: null }] }
          : g
      )
    );
  }

  function onCancel(gameId: string, signupId: string) {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId
          ? { ...g, signups: g.signups.filter((s) => s.id !== signupId) }
          : g
      )
    );
  }

  return (
    <section className="mt-6">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Upcoming Snack Duties
      </h2>
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
        {games.map((g) => (
          <SnackRow
            key={g.id}
            game={g}
            parentId={parentId}
            onSignup={(sid) => onSignup(g.id, sid)}
            onCancel={(sid) => onCancel(g.id, sid)}
          />
        ))}
      </div>
    </section>
  );
}

function SnackRow({
  game, parentId, onSignup, onCancel,
}: {
  game: SnackDashGame;
  parentId: string;
  onSignup: (signupId: string) => void;
  onCancel: (signupId: string) => void;
}) {
  const [showForm, setShowForm]       = useState(false);
  const [reminderEmail, setRem]       = useState(true);
  const [reminderSms, setRemSms]      = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [pending, start]              = useTransition();

  const mySignup  = game.signups.find((s) => s.parent_id === parentId);
  const openSlots = game.slots_per_game - game.signups.length;
  const isFull    = openSlots <= 0 && !mySignup;
  const time      = fmtTime(game.game_time);

  function handleSignup() {
    setError(null);
    start(async () => {
      const result = await claimSnackSlot(game.id, reminderEmail, reminderSms);
      if (result.error) { setError(result.error); return; }
      onSignup(crypto.randomUUID());
      setShowForm(false);
    });
  }

  function handleCancel() {
    if (!mySignup) return;
    if (!confirm("Cancel your snack signup?")) return;
    start(async () => {
      const result = await cancelSnackSlot(mySignup.id);
      if (result.error) { setError(result.error); return; }
      onCancel(mySignup.id);
    });
  }

  return (
    <div className="px-5 py-3">
      {/* Game info */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            href={`/parent/team/${game.team_id}`}
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

        {/* Quick action */}
        {mySignup ? (
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
        ) : isFull ? (
          <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">Covered ✓</span>
        ) : (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 rounded-lg border border-green-300 dark:border-green-700 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
          >
            I&apos;ll bring snacks
          </button>
        )}
      </div>

      {/* Inline reminder form */}
      {showForm && !mySignup && (
        <div className="mt-3 space-y-2 pl-1">
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={reminderEmail} onChange={(e) => setRem(e.target.checked)} className="accent-green-600" />
              Email reminder
            </label>
            <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
              <input type="checkbox" checked={reminderSms} onChange={(e) => setRemSms(e.target.checked)} className="accent-green-600" />
              Text reminder
            </label>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSignup}
              disabled={pending}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Signing up…" : "Confirm"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
