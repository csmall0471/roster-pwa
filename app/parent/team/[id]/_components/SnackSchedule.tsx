"use client";

import { useState, useTransition } from "react";
import { claimSnackSlot, cancelSnackSlot } from "@/app/(protected)/teams/schedule-actions";

export type SnackGameRow = {
  id: string;
  game_date: string;
  game_time: string | null;
  opponent: string | null;
  location: string | null;
  is_home: boolean;
  notes: string | null;
  signups: Array<{
    id: string;
    parent_id: string;
    slot_number: number;
    reminder_email: boolean;
    reminder_sms: boolean;
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

function mapsLink(location: string) {
  return `https://maps.google.com/?q=${encodeURIComponent(location)}`;
}

function isPast(dateStr: string) {
  return new Date(dateStr + "T23:59:59") < new Date();
}

export default function SnackSchedule({
  initialGames,
  slotsPerGame,
  parentId,
  teamName,
}: {
  initialGames: SnackGameRow[];
  slotsPerGame: number;
  parentId: string;
  teamName: string;
}) {
  const [games, setGames] = useState(initialGames);

  const upcoming = games.filter((g) => !isPast(g.game_date));
  const past     = games.filter((g) =>  isPast(g.game_date));

  function onSignup(gameId: string, signup: SnackGameRow["signups"][0]) {
    setGames((prev) =>
      prev.map((g) =>
        g.id === gameId ? { ...g, signups: [...g.signups, signup] } : g
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

  if (upcoming.length === 0 && past.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
        Schedule & Snacks
      </h2>
      <div className="space-y-2">
        {upcoming.map((g) => (
          <GameRow
            key={g.id}
            game={g}
            slotsPerGame={slotsPerGame}
            parentId={parentId}
            onSignup={(s) => onSignup(g.id, s)}
            onCancel={(sid) => onCancel(g.id, sid)}
            dimmed={false}
          />
        ))}
      </div>

      {past.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Past games
          </p>
          <div className="space-y-2 opacity-50">
            {[...past].reverse().map((g) => (
              <GameRow
                key={g.id}
                game={g}
                slotsPerGame={slotsPerGame}
                parentId={parentId}
                onSignup={() => {}}
                onCancel={() => {}}
                dimmed
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// ── GameRow ───────────────────────────────────────────────────────────────────

function GameRow({
  game, slotsPerGame, parentId, onSignup, onCancel, dimmed,
}: {
  game: SnackGameRow;
  slotsPerGame: number;
  parentId: string;
  onSignup: (s: SnackGameRow["signups"][0]) => void;
  onCancel: (signupId: string) => void;
  dimmed: boolean;
}) {
  const [showSignupForm, setShowSignupForm] = useState(false);
  const [reminderEmail, setReminderEmail]   = useState(true);
  const [reminderSms, setReminderSms]       = useState(false);
  const [error, setError]                   = useState<string | null>(null);
  const [pending, start]                    = useTransition();

  const mySignup  = game.signups.find((s) => s.parent_id === parentId);
  const openSlots = slotsPerGame - game.signups.length;
  const isFull    = openSlots <= 0;
  const time      = fmtTime(game.game_time);

  function handleSignup() {
    setError(null);
    start(async () => {
      const result = await claimSnackSlot(game.id, reminderEmail, reminderSms);
      if (result.error) { setError(result.error); return; }
      onSignup({
        id: crypto.randomUUID(),
        parent_id: parentId,
        slot_number: game.signups.length + 1,
        reminder_email: reminderEmail,
        reminder_sms: reminderSms,
        parents: null,
      });
      setShowSignupForm(false);
    });
  }

  function handleCancel() {
    if (!mySignup) return;
    if (!confirm("Cancel your snack signup?")) return;
    setError(null);
    start(async () => {
      const result = await cancelSnackSlot(mySignup.id);
      if (result.error) { setError(result.error); return; }
      onCancel(mySignup.id);
    });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      {/* Game info */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {fmtDate(game.game_date)}
            </span>
            {time && <span className="text-xs text-gray-400 dark:text-gray-500">{time}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
            {game.opponent && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {game.is_home ? "vs" : "@"} {game.opponent}
              </span>
            )}
            {game.location && (
              <a
                href={mapsLink(game.location)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {game.location} ↗
              </a>
            )}
          </div>
          {game.notes && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{game.notes}</p>
          )}
        </div>
      </div>

      {/* Snack section */}
      {!dimmed && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 dark:border-gray-800">
          {/* Who's signed up */}
          {game.signups.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {game.signups.map((s) => {
                const name = s.parents
                  ? `${s.parents.first_name} ${s.parents.last_name}`
                  : "Someone";
                const isMe = s.parent_id === parentId;
                return (
                  <span
                    key={s.id}
                    className={`text-xs rounded-full px-2.5 py-0.5 font-medium ${
                      isMe
                        ? "bg-green-500 text-white"
                        : "bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300"
                    }`}
                  >
                    🍎 {isMe ? "You" : name}
                  </span>
                );
              })}
            </div>
          )}

          {/* Action area */}
          {mySignup ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-green-700 dark:text-green-400">
                ✓ You&apos;re signed up for snacks
              </span>
              <button
                onClick={handleCancel}
                disabled={pending}
                className="text-xs text-red-500 hover:underline disabled:opacity-50"
              >
                {pending ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          ) : isFull ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">Snacks covered ✓</span>
          ) : showSignupForm ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Reminders for {fmtDate(game.game_date)}?
              </p>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderEmail}
                    onChange={(e) => setReminderEmail(e.target.checked)}
                    className="accent-green-600"
                  />
                  Email me the day before
                </label>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={reminderSms}
                    onChange={(e) => setReminderSms(e.target.checked)}
                    className="accent-green-600"
                  />
                  Text me the day before
                </label>
              </div>
              {error && <p className="text-xs text-red-500">{error}</p>}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSignup}
                  disabled={pending}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {pending ? "Signing up…" : "Confirm — I'll bring snacks"}
                </button>
                <button
                  onClick={() => setShowSignupForm(false)}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-xs text-amber-600 dark:text-amber-400">
                {openSlots} slot{openSlots !== 1 ? "s" : ""} open
              </span>
              <button
                onClick={() => setShowSignupForm(true)}
                className="rounded-lg border border-green-300 dark:border-green-700 px-3 py-1 text-xs font-medium text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
              >
                I&apos;ll bring snacks
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
