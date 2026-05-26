"use client";

import { useState, useTransition, useRef } from "react";
import {
  createGame, updateGame, deleteGame, updateTeamSnackSettings, importEvents,
} from "../../schedule-actions";
import { parseIcs, type ParsedEvent } from "@/lib/ics-parser";

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
  event_type: string;
  title: string | null;
  signups: GameSignup[];
};

type FormState = {
  game_date: string;
  game_time: string;
  event_type: string;
  title: string;
  opponent: string;
  location: string;
  is_home: boolean;
  notes: string;
};

const EMPTY_FORM: FormState = {
  game_date: "", game_time: "", event_type: "game", title: "",
  opponent: "", location: "", is_home: true, notes: "",
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

const inputCls = "w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500";

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
  const [games, setGames]               = useState<GameRow[]>(initialGames);
  const [snackEnabled, setSnackEnabled] = useState(initialSnackEnabled);
  const [slotsPerGame, setSlotsPerGame] = useState(initialSlots);
  const [addingGame, setAddingGame]     = useState(false);
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [form, setForm]                 = useState<FormState>(EMPTY_FORM);
  const [error, setError]               = useState<string | null>(null);
  const [showImport, setShowImport]     = useState(false);
  const [pending, start]                = useTransition();
  const [settingsPending, startSettings] = useTransition();

  const upcoming = games.filter((g) => !isPast(g.game_date));
  const past     = games.filter((g) =>  isPast(g.game_date));

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setAddingGame(true);
    setShowImport(false);
    setError(null);
  }

  function openEdit(g: GameRow) {
    setForm({
      game_date:  g.game_date,
      game_time:  g.game_time  ?? "",
      event_type: g.event_type ?? "game",
      title:      g.title      ?? "",
      opponent:   g.opponent   ?? "",
      location:   g.location   ?? "",
      is_home:    g.is_home,
      notes:      g.notes      ?? "",
    });
    setEditingId(g.id);
    setAddingGame(false);
    setShowImport(false);
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
      game_date:  form.game_date,
      game_time:  form.game_time || null,
      event_type: form.event_type,
      title:      form.event_type !== "game" ? (form.title || null) : null,
      opponent:   form.event_type === "game" ? (form.opponent || null) : null,
      location:   form.location || null,
      is_home:    form.is_home,
      notes:      form.notes || null,
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
        setGames((prev) =>
          [...prev, { id: crypto.randomUUID(), ...data, signups: [] }]
            .sort((a, b) => a.game_date.localeCompare(b.game_date))
        );
      }
      closeForm();
    });
  }

  function handleDelete(gameId: string) {
    if (!confirm("Delete this event? Existing signups will also be removed.")) return;
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

  function handleImported(imported: GameRow[]) {
    setGames((prev) =>
      [...prev, ...imported].sort((a, b) => a.game_date.localeCompare(b.game_date))
    );
    setShowImport(false);
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

      {/* Header with action buttons */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {games.length === 0 ? "No events yet" : `${upcoming.length} upcoming · ${past.length} past`}
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowImport((v) => !v); closeForm(); }}
            className="rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Import .ics
          </button>
          <button
            onClick={openAdd}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            + Add event
          </button>
        </div>
      </div>

      {/* ICS import panel */}
      {showImport && (
        <IcsImportPanel
          teamId={teamId}
          onImported={handleImported}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Inline add/edit form */}
      {(addingGame || editingId) && (
        <EventForm
          form={form}
          setForm={setForm}
          onSubmit={handleSubmit}
          onCancel={closeForm}
          error={error}
          pending={pending}
          isEdit={!!editingId}
        />
      )}

      {/* Upcoming events */}
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

      {/* Past events */}
      {past.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Past
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

      {games.length === 0 && !addingGame && !showImport && (
        <div className="text-center py-12 text-gray-400 dark:text-gray-500">
          <p className="text-sm">No events scheduled yet.</p>
          <button onClick={openAdd} className="text-sm text-blue-600 dark:text-blue-400 hover:underline mt-1">
            Add the first event →
          </button>
        </div>
      )}
    </div>
  );
}

// ── EventForm ─────────────────────────────────────────────────────────────────

function EventForm({
  form, setForm, onSubmit, onCancel, error, pending, isEdit,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  error: string | null;
  pending: boolean;
  isEdit: boolean;
}) {
  const isGame = form.event_type === "game";

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white dark:bg-gray-900 rounded-xl border border-blue-200 dark:border-blue-800 p-4 space-y-3"
    >
      <p className="text-sm font-semibold text-gray-900 dark:text-white">
        {isEdit ? "Edit event" : "Add event"}
      </p>

      {/* Event type */}
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
        <div className="flex gap-2">
          {(["game", "practice", "other"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setForm((f) => ({ ...f, event_type: t }))}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                form.event_type === t
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date *</label>
          <input
            type="date"
            required
            value={form.game_date}
            onChange={(e) => setForm((f) => ({ ...f, game_date: e.target.value }))}
            className={inputCls}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Time</label>
          <input
            type="time"
            value={form.game_time}
            onChange={(e) => setForm((f) => ({ ...f, game_time: e.target.value }))}
            className={inputCls}
          />
        </div>
      </div>

      {isGame ? (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Opponent</label>
            <input
              type="text"
              placeholder="e.g. Lions"
              value={form.opponent}
              onChange={(e) => setForm((f) => ({ ...f, opponent: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location</label>
            <input
              type="text"
              placeholder="e.g. Dobson Park"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Title</label>
            <input
              type="text"
              placeholder={form.event_type === "practice" ? "Practice" : "Event name"}
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Location</label>
            <input
              type="text"
              placeholder="e.g. Dobson Park"
              value={form.location}
              onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>
      )}

      {isGame && (
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
      )}

      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes</label>
        <input
          type="text"
          placeholder="Optional"
          value={form.notes}
          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          className={inputCls}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={pending || !form.game_date}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending ? "Saving…" : isEdit ? "Save changes" : "Add event"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── IcsImportPanel ────────────────────────────────────────────────────────────

type ImportRow = ParsedEvent & { checked: boolean };

function IcsImportPanel({
  teamId,
  onImported,
  onClose,
}: {
  teamId: string;
  onImported: (rows: GameRow[]) => void;
  onClose: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, startImport] = useTransition();

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed = parseIcs(text);
        if (parsed.length === 0) {
          setError("No events found in this file.");
          return;
        }
        setRows(parsed.map((p) => ({ ...p, checked: true })));
      } catch {
        setError("Could not parse this .ics file.");
      }
    };
    reader.readAsText(file);
  }

  function updateRow(i: number, patch: Partial<ImportRow>) {
    setRows((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  }

  function handleImport() {
    const selected = rows.filter((r) => r.checked);
    if (selected.length === 0) return;
    setError(null);
    startImport(async () => {
      const events = selected.map((r) => ({
        game_date:  r.game_date,
        game_time:  r.game_time,
        event_type: r.event_type,
        title:      r.event_type !== "game" ? (r.title || null) : null,
        opponent:   r.event_type === "game" ? (r.opponent || null) : null,
        location:   r.location,
        is_home:    r.is_home,
        notes:      null,
      }));
      const result = await importEvents(teamId, events);
      if (result.error) { setError(result.error); return; }
      const newRows: GameRow[] = events.map((e) => ({
        id: crypto.randomUUID(),
        ...e,
        notes: null,
        signups: [],
      }));
      onImported(newRows);
    });
  }

  const checkedCount = rows.filter((r) => r.checked).length;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-purple-200 dark:border-purple-800 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-900 dark:text-white">Import from .ics file</p>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
          ✕ Close
        </button>
      </div>

      {rows.length === 0 ? (
        <div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Upload a calendar file (.ics) exported from Mojo, Google Calendar, or any other calendar app.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            onChange={handleFile}
            className="block w-full text-sm text-gray-500 dark:text-gray-400
              file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0
              file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700
              dark:file:bg-blue-950 dark:file:text-blue-300
              hover:file:bg-blue-100 dark:hover:file:bg-blue-900"
          />
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {checkedCount} of {rows.length} events selected
            </p>
            <button
              onClick={() => {
                const allChecked = rows.every((r) => r.checked);
                setRows((prev) => prev.map((r) => ({ ...r, checked: !allChecked })));
              }}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              {rows.every((r) => r.checked) ? "Deselect all" : "Select all"}
            </button>
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400 w-8"></th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Time</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Type</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Title / Opponent</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">Location</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500 dark:text-gray-400">H/A</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {rows.map((row, i) => (
                  <tr key={i} className={row.checked ? "" : "opacity-40"}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={row.checked}
                        onChange={(e) => updateRow(i, { checked: e.target.checked })}
                        className="accent-blue-600"
                      />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                      {fmtDate(row.game_date)}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="time"
                        value={row.game_time ?? ""}
                        onChange={(e) => updateRow(i, { game_time: e.target.value || null })}
                        className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-24"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={row.event_type}
                        onChange={(e) => updateRow(i, { event_type: e.target.value as any })}
                        className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      >
                        <option value="game">Game</option>
                        <option value="practice">Practice</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.event_type === "game" ? (row.opponent ?? "") : (row.title ?? "")}
                        onChange={(e) =>
                          updateRow(i, row.event_type === "game"
                            ? { opponent: e.target.value || null }
                            : { title: e.target.value || null }
                          )
                        }
                        className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-28"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.location ?? ""}
                        onChange={(e) => updateRow(i, { location: e.target.value || null })}
                        className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white w-28"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.event_type === "game" ? (
                        <select
                          value={row.is_home ? "home" : "away"}
                          onChange={(e) => updateRow(i, { is_home: e.target.value === "home" })}
                          className="rounded border border-gray-300 dark:border-gray-600 px-1.5 py-0.5 text-xs bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          <option value="home">Home</option>
                          <option value="away">Away</option>
                        </select>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={handleImport}
              disabled={importing || checkedCount === 0}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {importing ? "Importing…" : `Import ${checkedCount} event${checkedCount !== 1 ? "s" : ""}`}
            </button>
            <button
              onClick={() => {
                setRows([]);
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Choose different file
            </button>
          </div>
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
  const isGame = !game.event_type || game.event_type === "game";

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Date + time + type badge */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 dark:text-white text-sm">
              {fmtDate(game.game_date)}
            </span>
            {time && (
              <span className="text-xs text-gray-400 dark:text-gray-500">{time}</span>
            )}
            {isGame ? (
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                game.is_home
                  ? "bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}>
                {game.is_home ? "Home" : "Away"}
              </span>
            ) : (
              <span className="text-xs rounded-full px-2 py-0.5 font-medium bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300">
                {game.event_type === "practice" ? "Practice" : (game.title ?? "Event")}
              </span>
            )}
          </div>

          {/* Opponent / title + location */}
          <div className="flex flex-wrap items-center gap-x-2 mt-0.5">
            {isGame && game.opponent && (
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {game.is_home ? "vs" : "@"} {game.opponent}
              </span>
            )}
            {!isGame && game.event_type === "other" && game.title && (
              <span className="text-sm text-gray-700 dark:text-gray-300">{game.title}</span>
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

          {/* Snack status — only for games */}
          {snackEnabled && !dimmed && isGame && (
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
