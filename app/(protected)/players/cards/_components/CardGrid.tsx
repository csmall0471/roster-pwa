"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { bulkAssignPhotosToTeam } from "../../photo-actions";

type Photo = {
  id: string;
  public_url: string;
  team_id: string | null;
  team_name: string | null;
  season: string | null;
  is_primary: boolean;
  players: { id: string; first_name: string; last_name: string } | null;
};

type Team = { id: string; name: string; season: string | null; organization: string | null };

type Filter = "all" | "unassigned";

export default function CardGrid({ photos, teams }: { photos: Photo[]; teams: Team[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<Filter>("all");
  const [assignTeamId, setAssignTeamId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = filter === "unassigned" ? photos.filter((p) => !p.team_id) : photos;

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visible.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible.map((p) => p.id)));
    }
  }

  function handleAssign() {
    if (!selected.size) return;
    setError(null);
    startTransition(async () => {
      const result = await bulkAssignPhotosToTeam(
        Array.from(selected),
        assignTeamId || null
      );
      if (result.error) {
        setError(result.error);
      } else {
        setSelected(new Set());
        setAssignTeamId("");
      }
    });
  }

  const unassignedCount = photos.filter((p) => !p.team_id).length;

  return (
    <div>
      {/* Filter + select-all bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-sm">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 ${filter === "all" ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
          >
            All ({photos.length})
          </button>
          <button
            onClick={() => setFilter("unassigned")}
            className={`px-3 py-1.5 border-l border-gray-200 dark:border-gray-700 ${filter === "unassigned" ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium" : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
          >
            Unassigned ({unassignedCount})
          </button>
        </div>

        {visible.length > 0 && (
          <button
            onClick={toggleAll}
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {selected.size === visible.length ? "Deselect all" : `Select all ${visible.length}`}
          </button>
        )}

        {selected.size > 0 && (
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {selected.size} selected
          </span>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-20 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3 shadow-sm">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Assign {selected.size} card{selected.size !== 1 ? "s" : ""} to:
          </span>
          <select
            value={assignTeamId}
            onChange={(e) => setAssignTeamId(e.target.value)}
            className="flex-1 min-w-40 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:border-blue-500 focus:outline-none"
          >
            <option value="">No team (unassign)</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.season ? ` — ${t.season}` : ""}{t.organization ? ` (${t.organization})` : ""}
              </option>
            ))}
          </select>
          <button
            onClick={handleAssign}
            disabled={pending}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {pending ? "Saving…" : "Apply"}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            Cancel
          </button>
          {error && <p className="w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
        </div>
      )}

      {/* Grid */}
      {visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400 dark:text-gray-500">
          <p className="text-sm">{filter === "unassigned" ? "All cards are assigned to teams." : "No cards yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {visible.map((photo) => {
            const isSelected = selected.has(photo.id);
            const playerName = photo.players
              ? `${photo.players.first_name} ${photo.players.last_name}`
              : "Unknown";

            return (
              <div
                key={photo.id}
                onClick={() => toggleOne(photo.id)}
                className={`relative rounded-xl overflow-hidden border-2 cursor-pointer transition-all ${
                  isSelected
                    ? "border-blue-500 ring-2 ring-blue-300 dark:ring-blue-700"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                } ${pending ? "opacity-50 pointer-events-none" : ""}`}
              >
                <Image
                  src={photo.public_url}
                  alt={playerName}
                  width={160}
                  height={224}
                  className="w-full object-cover aspect-[5/7]"
                />

                {/* Checkbox */}
                <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center ${
                  isSelected
                    ? "bg-blue-500 border-blue-500"
                    : "bg-white/80 border-gray-300"
                }`}>
                  {isSelected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>

                {/* Team badge */}
                {photo.team_name && (
                  <span className="absolute top-2 right-2 bg-blue-600/90 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full max-w-[70px] truncate leading-tight">
                    {photo.team_name}
                  </span>
                )}

                {/* Player name footer */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                  <Link
                    href={`/players/${photo.players?.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="text-white text-xs font-medium leading-tight hover:underline block truncate"
                  >
                    {playerName}
                  </Link>
                  {photo.season && (
                    <p className="text-white/70 text-[10px] leading-tight truncate">{photo.season}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
