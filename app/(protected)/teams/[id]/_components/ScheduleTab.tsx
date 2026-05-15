"use client";

import { useState, useTransition } from "react";
import {
  createGame, updateGame, deleteGame, updateTeamSnackSettings,
} from "../../schedule-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

export type GameSignup = {
  id: string;
  parent_id: string;
  slot_number: number;
  parents: { first_name: string; last_name: string } | null;
};

export type GameRow = {
  id: string;
  game_date: string;
  game_time: string | null;
  opponent: string | null;
  location: string | null;
  is_home: boolean;
  notes: string | null;
  signups: GameSignup[];
};

type FormState = {
  game_date: string;
  game_time: string;
  opponent: string;
  location: string;
  is_home: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  game_date: "", game_time: "", opponent: "", location: "", is_home: true, notes: "",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── ScheduleTab ───────────────────────────────────────────────────────────────

export default function ScheduleTab({
  teamId,
  initialGames,
  snackEnabled: initialSnackEnabled,
  slotsPerGame: initialSlots,
  rosterCount,
}: {
  teamId: string;
  initialGames: GameRow[];
  snackEnabled: boolean;
  slotsPerGame: number;
  rosterCount: number;
}) {
  const [games, setGames]             = useState<GameRow[]>(initialGames);
  const [snackEnabled, setSnackEnabled] = useState(initialSnackEnabled);
  const [slotsPerGame, setSlotsPerGame] = useState(initialSlots);
  const [addingGame, setAddingGame]   = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const [form, setForm]               = useState<FormState>(EMPTY_FORM);
  const [error, setError]             = useState<string | null>(null);
  const [pending, start]              = useTransition();
  const [settingsPending, startSettings] = useTransition();

  const upcoming = games.filter((g) => !isPast(g.game_date));
  const past     = games.filter((g) =>  isPast(g.game_date));

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAddingGame(true);
    setError(null);
  }

  function openEdit(g: GameRow) {
    setForm({
      game_date: g.game_date,
      game_time: g.game_time ?? "",
      opponent:  g.opponent  ?? "",
      location:  g.location  ?? "",
      is_home:   g.is_home,
      notes:     g.notes     ?? "",
    });
    setEditingId(g.id);
    setAddingGame(false);
    setError(null);
  }

  function closeForm() {
    setAddingGame(false);
    setEditingId(null);
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.game_date) return;
    setError(null);

    const data = {
      game_date: form.game_date,
      game_time: form.game_time || null,
      opponent:  form.opponent  || null,
      location:  form.location  || null,
      is_home:   form.is_home,
      notes:     form.notes     || null,
    };

    start(async () => {
      if (editingId) {
        const result = await updateGame(editingId, teamId, data);
        if (result.error) { setError(result.error); return; }
        setGames((prev) =>
          prev.map((g) => g.id === editingId ? { ...g, ...data } : g)
        );
      } else {
        const result = await createGame(teamId, data);
        if (result.error) { setError(result.error); return; }
        // Reload to get the new id — revalidatePath will refresh the server data
        setGames((prev) =>
          [...prev, { id: crypto.randomUUID(), ...data, signups: [] }]
            .sort((a, b) => a.game_date.localeCompare(b.game_date))
        );
      }
      closeForm();
    });
  }

  function handleDelete(gameId: string) {
    if (!confirm("Delete this game? Existing signups will also be removed.")) return;
    start(async () => {
      const result = await deleteGame(gameId, teamId);
      if (result.error) { setError(result.error); return; }
      setGames((prev) => prev.filter((g) => g.id !== gameId));
    });
  }

  function handleSnackToggle(enabled: boolean) {
    startSettings(async () => {
      await updateTeamSnackSettings(teamId, { snack_signup_enabled: enabled, snack_slots_per_game: slotsPerGame });
      setSnackEnabled(enabled);
    });
  }

  function handleSlotsChange(slots: number) {
    startSettings(async () => {
      await updateTeamSnackSettings(teamId, { snack_signup_enabled: snackEnabled, snack_slots_per_game: slots });
      setSlotsPerGame(slots);
    });
  }

  return (
    <div className="space-y-6">
      {/* Snack signup settings */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="font-medium text-gray-900 dark:text-white text-sm">Snack signup</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {rosterCount} players on roster
              {snackEnabled ? ` · ${slotsPerGame} family slot${slotsPerGame !== 1 ? "s" : ""} per game` : ""}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {snackEnabled && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500 dark:text-gray-400">Slots per game:</span>
                {[1, 2, 3].map((n) => (
                  <button
                    key={n}
                    onClick={() => handleSlotsChange(n)}
                    disabled={settingsPending}
                    className={`w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                      slotsPerGame === n
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => handleSnackToggle(!snackEnabled)}
              disabled={settingsPending}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                snackEnabled ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  snackEnabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Game list header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {games.length === 0 ? "No games yet" : `${upcoming.length} upcoming · ${past.length} past`}
        </p>
        <button
          onClick={openAdd}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + Add game
        </button>
      </div>

      {/* Inline add/edit form */}
      {(addingGame || editingId) && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3"
        >
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {editingId ? "Edit game" : "Add game"}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date *</label>
              <input
                type="date"
                required
                value={form.game_date}
                onChange={(e) => setForm((f) => ({ ...f, game_date: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Time</label>
              <input
                type="time"
                value={form.game_time}
                onChange={(e) => setForm((f) => ({ ...f, game_time: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Opponent</label>
              <input
                type="text"
                placeholder="e.g. Lions"
                value={form.opponent}
                onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location</label>
              <input
                type="text"
                placeholder="e.g. Dobson Park"
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="home_away"
                checked={form.is_home}
                onChange={() => setForm((f) => ({ ...f, is_home: true }))}
                className="accent-blue-600"
              />
              Home
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                name="home_away"
                checked={!form.is_home}
                onChange={() => setForm((f) => ({ ...f, is_home: false }))}
                className="accent-blue-600"
              />
              Away
            </label>
          </div>

          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
            <input
              type="text"
              placeholder="Optional"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              type="submit"
              disabled={pending || !form.game_date}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {pending ? "Saving…" : editingId ? "Save changes" : "Add game"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Upcoming games */}
      {upcoming.length > 0 && (
        <div className="space-y-2">
          {upcoming.map((g) => (
            <GameCard
              key={g.id}
              game={g}
              snackEnabled={snackEnabled}
              slotsPerGame={slotsPerGame}
              onEdit={() => openEdit(g)}
              onDelete={() => handleDelete(g.id)}
              dimmed={false}
            />
          ))}
        </div>
      )}

      {/* Past games */}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Past games
          </p>
          <div className="space-y-2 opacity-50">
            {[...past].reverse().map((g) => (
              <GameCard
                key={g.id}
                game={g}
                snackEnabled={snackEnabled}
                slotsPerGame={slotsPerGame}
                onEdit={() => openEdit(g)}
                onDelete={() => handleDelete(g.id)}
                dimmed
              />
            ))}
          </div>
        </div>
      )}

      {games.length === 0 && !addingGame && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-sm">No games scheduled yet.</p>
          <button onClick={openAdd} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">
            Add the first game →
          </button>
        </div>
      )}
    </div>
  );
}

// ── GameCard ──────────────────────────────────────────────────────────────────

function GameCard({
  game, snackEnabled, slotsPerGame, onEdit, onDelete, dimmed,
}: {
  game: GameRow;
  snackEnabled: boolean;
  slotsPerGame: number;
  onEdit: () => void;
  onDelete: () => void;
  dimmed: boolean;
}) {
  const time = fmtTime(game.game_time);
  const signedUp = game.signups.map((s) =>
    s.parents ? `${s.parents.first_name} ${s.parents.last_name}` : "Unknown"
  );
  const openSlots = slotsPerGame - game.signups.length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Date + time */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {fmtDate(game.game_date)}
            </span>
            {time && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{time}</span>
            )}
            <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
              game.is_home
                ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
            }`}>
              {game.is_home ? "Home" : "Away"}
            </span>
          </div>

          {/* Opponent + location */}
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
            {game.opponent && (
              <span className="text-sm text-gray-700 dark:text-gray-300">
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

          {/* Snack status */}
          {snackEnabled && !dimmed && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {signedUp.length > 0 ? (
                signedUp.map((name, i) => (
                  <span key={i} className="text-xs rounded-full px-2.5 py-0.5 bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-300 font-medium">
                    🍎 {name}
                  </span>
                ))
              ) : null}
              {openSlots > 0 && (
                <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                  {openSlots} snack slot{openSlots !== 1 ? "s" : ""} open
                </span>
              )}
              {openSlots === 0 && game.signups.length > 0 && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">✓ Snacks covered</span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {!dimmed && (
          <div className="flex items-center gap-3 shrink-0 text-xs">
            <button onClick={onEdit} className="text-blue-600 dark:text-blue-400 hover:underline">
              Edit
            </button>
            <button onClick={onDelete} className="text-red-500 hover:underline">
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
