"use client";

import { useMemo, useState } from "react";
import type { TeamWithRoster } from "../page";

// Bulk roster-player picker for an interest list: players grouped by team with
// per-team select-all, a search box, and already-listed players shown checked
// and locked so the coach can see who's in.
export default function InterestPlayerPicker({
  teams,
  alreadyIn,
  listName,
  busy,
  onAdd,
  onClose,
}: {
  teams: TeamWithRoster[];
  alreadyIn: Set<string>;
  listName: string;
  busy: boolean;
  onAdd: (playerIds: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Teams → unique players (a player on two teams shows under both; selection
  // is by id so it's still one pick).
  const groups = useMemo(() => {
    return teams
      .map((t) => {
        const seen = new Set<string>();
        const players: { id: string; name: string }[] = [];
        for (const r of t.roster ?? []) {
          const p = r.players;
          if (!p || seen.has(p.id)) continue;
          seen.add(p.id);
          players.push({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim() });
        }
        players.sort((a, b) => a.name.localeCompare(b.name));
        return {
          id: t.id,
          label: [t.name, t.season].filter(Boolean).join(" · "),
          players,
        };
      })
      .filter((g) => g.players.length > 0);
  }, [teams]);

  const query = q.trim().toLowerCase();
  const visible = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          players: query ? g.players.filter((p) => p.name.toLowerCase().includes(query)) : g.players,
        }))
        .filter((g) => g.players.length > 0),
    [groups, query]
  );

  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleTeam = (players: { id: string }[]) => {
    const selectable = players.filter((p) => !alreadyIn.has(p.id)).map((p) => p.id);
    const allPicked = selectable.length > 0 && selectable.every((id) => picked.has(id));
    setPicked((prev) => {
      const next = new Set(prev);
      for (const id of selectable) {
        if (allPicked) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4">
      <div className="my-8 w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">
            Add players to “{listName}”
          </h3>
          <button onClick={onClose} className="text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            ✕
          </button>
        </div>

        <div className="p-3">
          <input
            autoFocus
            type="search"
            placeholder="Search players…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-3 pb-2">
          {visible.length === 0 && (
            <p className="py-6 text-center text-sm text-gray-400">No players match.</p>
          )}
          {visible.map((g) => {
            const selectable = g.players.filter((p) => !alreadyIn.has(p.id));
            const allPicked = selectable.length > 0 && selectable.every((p) => picked.has(p.id));
            return (
              <div key={g.id} className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
                    {g.label}
                  </p>
                  {selectable.length > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleTeam(g.players)}
                      className="text-[11px] font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400"
                    >
                      {allPicked ? "Clear team" : `Select team (${selectable.length})`}
                    </button>
                  )}
                </div>
                <div className="space-y-0.5">
                  {g.players.map((p) => {
                    const inList = alreadyIn.has(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${
                          inList
                            ? "text-gray-400 dark:text-gray-500"
                            : "cursor-pointer text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={inList || picked.has(p.id)}
                          disabled={inList}
                          onChange={() => toggle(p.id)}
                          className="h-4 w-4 rounded accent-blue-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {inList && <span className="text-[10px] font-semibold uppercase">in list</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 dark:border-gray-800 px-4 py-3">
          <span className="text-xs text-gray-500 dark:text-gray-400">{picked.size} selected</span>
          <button
            type="button"
            onClick={() => onAdd([...picked])}
            disabled={picked.size === 0 || busy}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
          >
            {busy ? "Adding…" : `Add ${picked.size || ""}`.trim()}
          </button>
        </div>
      </div>
    </div>
  );
}
