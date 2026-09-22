"use client";

import { useRef, useState } from "react";
import { setAwardPlayers, saveSeasonNote } from "@/app/(protected)/teams/season-actions";

// Coach-only end-of-season workspace: hand out player awards (a winner + ordered
// runner-ups) and jot a note about each kid for the end-of-season speech. Lives
// on the (protected) team page, so it's never visible to parents.

export type SeasonPlayer = { id: string; first_name: string; last_name: string };

// The four awards, in display order. `key` is stored in team_awards.award_key.
const AWARDS = [
  { key: "long_way", label: "You've Come a Long Way", emoji: "📈", blurb: "Most improved" },
  { key: "consistency", label: "Mr. Consistency", emoji: "🎯", blurb: "Shows up every time" },
  { key: "hustle", label: "Hustle Hero", emoji: "🔥", blurb: "Relentless effort" },
  { key: "leader", label: "Leader of the Pack", emoji: "🐺", blurb: "Sets the tone" },
] as const;

type Props = {
  teamId: string;
  players: SeasonPlayer[];
  initialAwards: Record<string, string[]>; // awardKey → ordered player ids (0 = winner)
  initialNotes: Record<string, string>; // playerId → note
};

export default function SeasonTab({ teamId, players, initialAwards, initialNotes }: Props) {
  const [awards, setAwards] = useState<Record<string, string[]>>(initialAwards);
  const [notes, setNotes] = useState<Record<string, string>>(initialNotes);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overZone, setOverZone] = useState<string | null>(null); // `${key}:${zone}`
  const noteTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const byId = new Map(players.map((p) => [p.id, p]));
  const label = (id: string) => {
    const p = byId.get(id);
    return p ? `${p.first_name} ${p.last_name.charAt(0)}.`.trim() : "Player";
  };

  // Persist one award's ordered list (fire-and-forget; UI is optimistic).
  function commit(key: string, ids: string[]) {
    setAwards((a) => ({ ...a, [key]: ids }));
    setAwardPlayers({ teamId, awardKey: key, playerIds: ids }).catch(() => {});
  }
  const makeWinner = (key: string, pid: string) =>
    commit(key, [pid, ...(awards[key] ?? []).filter((id) => id !== pid)]);
  const addRunnerUp = (key: string, pid: string) => {
    const cur = awards[key] ?? [];
    if (!cur.includes(pid)) commit(key, [...cur, pid]);
  };
  const removeFrom = (key: string, pid: string) =>
    commit(key, (awards[key] ?? []).filter((id) => id !== pid));

  function onNoteChange(pid: string, value: string) {
    setNotes((n) => ({ ...n, [pid]: value }));
    clearTimeout(noteTimers.current[pid]);
    noteTimers.current[pid] = setTimeout(() => {
      saveSeasonNote({ teamId, playerId: pid, note: value }).catch(() => {});
    }, 700);
  }

  // ── Drag & drop (desktop). Mobile uses the tap controls below. ──
  const dropProps = (key: string, zone: "winner" | "runner", onDrop: (pid: string) => void) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setOverZone(`${key}:${zone}`);
    },
    onDragLeave: () => setOverZone((z) => (z === `${key}:${zone}` ? null : z)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const pid = e.dataTransfer.getData("text/plain") || dragId;
      setOverZone(null);
      setDragId(null);
      if (pid) onDrop(pid);
    },
  });

  const chipDrag = (pid: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData("text/plain", pid);
      e.dataTransfer.effectAllowed = "copy";
      setDragId(pid);
    },
    onDragEnd: () => {
      setDragId(null);
      setOverZone(null);
    },
  });

  if (players.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center">
        Add players to this team first, then hand out awards and write season notes here.
      </p>
    );
  }

  return (
    <div className="space-y-10">
      {/* ── Awards ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Player awards</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag a player onto an award — or tap <strong>＋</strong> on the award. The top spot is the
            winner; everyone below is a runner-up. Only you can see this.
          </p>
        </div>

        {/* Player pool */}
        <div className="mb-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Roster — drag a player onto an award
          </p>
          <div className="flex flex-wrap gap-1.5">
            {players.map((p) => (
              <span
                key={p.id}
                {...chipDrag(p.id)}
                className="cursor-grab select-none rounded-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-1 text-sm text-gray-800 dark:text-gray-200 shadow-sm active:cursor-grabbing"
                title={`${p.first_name} ${p.last_name}`}
              >
                {p.first_name} {p.last_name.charAt(0)}.
              </span>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {AWARDS.map((award) => {
            const ids = awards[award.key] ?? [];
            const winner = ids[0];
            const runners = ids.slice(1);
            const notAssigned = players.filter((p) => !ids.includes(p.id));
            return (
              <div
                key={award.key}
                className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {award.emoji}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 dark:text-white leading-tight">
                      {award.label}
                    </h3>
                    <p className="text-[11px] text-gray-400 dark:text-gray-500">{award.blurb}</p>
                  </div>
                  <div className="ml-auto">
                    <AddMenu players={notAssigned} onPick={(pid) => addRunnerUp(award.key, pid)} />
                  </div>
                </div>

                {/* Winner */}
                <div
                  {...dropProps(award.key, "winner", (pid) => makeWinner(award.key, pid))}
                  className={`mt-3 rounded-xl border-2 border-dashed p-2.5 transition-colors ${
                    overZone === `${award.key}:winner`
                      ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    🏆 Winner
                  </p>
                  {winner ? (
                    <div className="flex items-center gap-2">
                      <span
                        {...chipDrag(winner)}
                        className="cursor-grab rounded-full bg-amber-100 dark:bg-amber-900/50 px-3 py-1 text-sm font-semibold text-amber-900 dark:text-amber-200"
                      >
                        {label(winner)}
                      </span>
                      <button
                        onClick={() => removeFrom(award.key, winner)}
                        className="ml-auto text-xs text-gray-400 hover:text-red-600"
                        aria-label="Remove winner"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">Drop the winner here</p>
                  )}
                </div>

                {/* Runner-ups */}
                <div
                  {...dropProps(award.key, "runner", (pid) => addRunnerUp(award.key, pid))}
                  className={`mt-2 rounded-xl border-2 border-dashed p-2.5 transition-colors ${
                    overZone === `${award.key}:runner`
                      ? "border-blue-400 bg-blue-50 dark:bg-blue-950/30"
                      : "border-gray-200 dark:border-gray-700"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Runner-ups
                  </p>
                  {runners.length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {runners.map((pid) => (
                        <span
                          key={pid}
                          {...chipDrag(pid)}
                          className="group flex cursor-grab items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 py-1 pl-3 pr-1.5 text-sm text-gray-800 dark:text-gray-200"
                        >
                          {label(pid)}
                          <button
                            onClick={() => makeWinner(award.key, pid)}
                            className="rounded px-1 text-[11px] text-amber-600 hover:text-amber-700 dark:text-amber-400"
                            title="Make winner"
                          >
                            ★
                          </button>
                          <button
                            onClick={() => removeFrom(award.key, pid)}
                            className="rounded px-1 text-xs text-gray-400 hover:text-red-600"
                            aria-label="Remove"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      Drop runner-ups here (tap ★ to promote to winner)
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── End-of-season notes ────────────────────────────── */}
      <section>
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            End-of-season notes
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            A line or two about each kid for your speech. Saved automatically.
          </p>
        </div>
        <div className="space-y-2.5">
          {players.map((p) => (
            <div
              key={p.id}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3"
            >
              <label className="text-sm font-medium text-gray-800 dark:text-gray-200">
                {p.first_name} {p.last_name}
              </label>
              <textarea
                value={notes[p.id] ?? ""}
                onChange={(e) => onNoteChange(p.id, e.target.value)}
                rows={2}
                placeholder={`What you'll say about ${p.first_name}…`}
                className="mt-1.5 w-full resize-y rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-950 px-2.5 py-2 text-sm text-gray-900 dark:text-white placeholder:text-gray-400"
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// Tap-friendly "add a player to this award" menu (the mobile path; also handy on
// desktop). A native select keeps it simple and accessible.
function AddMenu({
  players,
  onPick,
}: {
  players: SeasonPlayer[];
  onPick: (playerId: string) => void;
}) {
  if (players.length === 0) return null;
  return (
    <select
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
        e.currentTarget.value = "";
      }}
      className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300"
      aria-label="Add a player to this award"
      title="Add a player"
    >
      <option value="">＋ Add</option>
      {players.map((p) => (
        <option key={p.id} value={p.id}>
          {p.first_name} {p.last_name}
        </option>
      ))}
    </select>
  );
}
