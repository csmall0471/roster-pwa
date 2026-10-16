"use client";

import { useMemo, useState } from "react";

export type TeamOption = { id: string; name: string; seasonLabel: string | null; active: boolean };
export type PlayerOption = { id: string; name: string };

type Props = {
  teams: TeamOption[];
  allPlayers: PlayerOption[];
  onClose: () => void;
  onSubmit: (input: {
    teamIds: string[];
    playerIds: string[];
    includeParents: boolean;
    includeSiblings: boolean;
  }) => Promise<void>;
};

// Pick whole teams (active first) and/or individual players, with toggles for
// bringing their parents (standing) and siblings along.
export default function AddPeopleModal({ teams, allPlayers, onClose, onSubmit }: Props) {
  const [teamIds, setTeamIds] = useState<Set<string>>(new Set());
  const [playerIds, setPlayerIds] = useState<Set<string>>(new Set());
  const [includeParents, setIncludeParents] = useState(true);
  const [includeSiblings, setIncludeSiblings] = useState(true);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [playerSearch, setPlayerSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sortedTeams = useMemo(
    () =>
      [...teams].sort(
        (a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)
      ),
    [teams]
  );

  const visiblePlayers = useMemo(() => {
    const q = playerSearch.trim().toLowerCase();
    if (!q) return allPlayers;
    return allPlayers.filter((p) => p.name.toLowerCase().includes(q));
  }, [allPlayers, playerSearch]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const canSubmit = (teamIds.size > 0 || playerIds.size > 0) && !submitting;

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await onSubmit({
        teamIds: [...teamIds],
        playerIds: [...playerIds],
        includeParents,
        includeSiblings,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const checkbox =
    "h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add people</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Teams */}
        <p className="mt-3 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Teams
        </p>
        <div className="mt-1 space-y-1">
          {sortedTeams.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">No teams yet.</p>
          )}
          {sortedTeams.map((t) => (
            <label
              key={t.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-2.5 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <input
                type="checkbox"
                className={checkbox}
                checked={teamIds.has(t.id)}
                onChange={() => setTeamIds((s) => toggle(s, t.id))}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900 dark:text-white">
                {t.name}
                {t.seasonLabel && (
                  <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
                    {t.seasonLabel}
                  </span>
                )}
              </span>
              {t.active && (
                <span className="rounded-full bg-green-100 dark:bg-green-950 px-1.5 py-0.5 text-[10px] font-semibold text-green-700 dark:text-green-300">
                  active
                </span>
              )}
            </label>
          ))}
        </div>

        {/* Individual players */}
        <button
          type="button"
          onClick={() => setPlayersOpen((o) => !o)}
          className="mt-3 flex w-full items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          <span className={`transition-transform ${playersOpen ? "rotate-90" : ""}`}>▸</span>
          Individual players{playerIds.size > 0 ? ` (${playerIds.size} selected)` : ""}
        </button>
        {playersOpen && (
          <div className="mt-1">
            <input
              type="search"
              value={playerSearch}
              onChange={(e) => setPlayerSearch(e.target.value)}
              placeholder="Search players…"
              className="input"
            />
            <div className="mt-1 max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 p-1">
              {visiblePlayers.map((p) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={playerIds.has(p.id)}
                    onChange={() => setPlayerIds((s) => toggle(s, p.id))}
                  />
                  <span className="truncate text-sm text-gray-800 dark:text-gray-200">{p.name}</span>
                </label>
              ))}
              {visiblePlayers.length === 0 && (
                <p className="px-2 py-1 text-sm text-gray-500 dark:text-gray-400">No matches.</p>
              )}
            </div>
          </div>
        )}

        {/* Toggles */}
        <div className="mt-3 space-y-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              className={checkbox}
              checked={includeParents}
              onChange={(e) => setIncludeParents(e.target.checked)}
            />
            Include parents (standing)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
            <input
              type="checkbox"
              className={checkbox}
              checked={includeSiblings}
              onChange={(e) => setIncludeSiblings(e.target.checked)}
            />
            Include siblings
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={submit}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? "Adding…" : "Add people"}
          </button>
        </div>
      </div>
    </div>
  );
}
