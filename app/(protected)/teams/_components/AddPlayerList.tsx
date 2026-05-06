"use client";

import { useState, useActionState } from "react";
import { addPlayersToTeam, type RosterActionState } from "../roster-actions";

type Player = {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
};

export default function AddPlayerList({
  teamId,
  players,
}: {
  teamId: string;
  players: Player[];
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, formAction, pending] = useActionState<RosterActionState, FormData>(
    addPlayersToTeam,
    null
  );

  const filtered = query
    ? players.filter((p) =>
        `${p.first_name} ${p.last_name}`
          .toLowerCase()
          .includes(query.toLowerCase())
      )
    : players;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filtered.map((p) => p.id)));
  }

  function clearAll() {
    setSelected(new Set());
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="team_id" value={teamId} />

      <input
        type="search"
        placeholder="Search players…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      />

      {filtered.length > 0 && (
        <div className="flex gap-3 text-xs text-gray-500">
          <button type="button" onClick={selectAll} className="hover:text-blue-600">
            Select all
          </button>
          <span>·</span>
          <button type="button" onClick={clearAll} className="hover:text-blue-600">
            Clear
          </button>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
        {filtered.map((player) => (
          <label
            key={player.id}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors select-none ${
              selected.has(player.id)
                ? "bg-blue-50 border border-blue-200"
                : "hover:bg-gray-50 border border-transparent"
            }`}
          >
            <input
              type="checkbox"
              name="player_ids"
              value={player.id}
              checked={selected.has(player.id)}
              onChange={() => toggle(player.id)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex-1 text-sm font-medium text-gray-900">
              {player.first_name} {player.last_name}
            </span>
            {player.grade && (
              <span className="text-xs text-gray-400">{player.grade}</span>
            )}
          </label>
        ))}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-6">No players match.</p>
        )}
      </div>

      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <span className="text-sm text-gray-500">
          {selected.size > 0
            ? `${selected.size} selected`
            : "Select players above"}
        </span>
        <button
          type="submit"
          disabled={pending || selected.size === 0}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {pending
            ? "Adding…"
            : `Add ${selected.size > 0 ? selected.size : ""} player${selected.size !== 1 ? "s" : ""}`}
        </button>
      </div>
    </form>
  );
}
