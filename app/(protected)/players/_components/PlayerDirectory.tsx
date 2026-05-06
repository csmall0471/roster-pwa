"use client";

import { useState, useMemo, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import type { PlayerWithParents } from "@/lib/types";
import DeletePlayerButton from "./DeletePlayerButton";
import MessageComposer from "./MessageComposer";
import {
  bulkDeletePlayers,
  bulkAddToTeam,
  bulkRemoveFromTeam,
} from "../actions";

// ── Types ─────────────────────────────────────────────────────

type SortKey = "last_name" | "first_name" | "dob" | "created_at";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; dir: SortDir; label: string }[] = [
  { key: "last_name",  dir: "asc",  label: "Last name A → Z" },
  { key: "last_name",  dir: "desc", label: "Last name Z → A" },
  { key: "first_name", dir: "asc",  label: "First name A → Z" },
  { key: "first_name", dir: "desc", label: "First name Z → A" },
  { key: "dob",        dir: "asc",  label: "Oldest first" },
  { key: "dob",        dir: "desc", label: "Youngest first" },
  { key: "created_at", dir: "desc", label: "Newest added" },
  { key: "created_at", dir: "asc",  label: "Oldest added" },
];

// ── Helpers ───────────────────────────────────────────────────

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

function sortValue(player: PlayerWithParents, key: SortKey): string {
  switch (key) {
    case "last_name":  return (player.last_name ?? "").toLowerCase();
    case "first_name": return (player.first_name ?? "").toLowerCase();
    case "dob":        return player.date_of_birth ?? "9999";
    case "created_at": return player.created_at ?? "";
  }
}

// ── Component ─────────────────────────────────────────────────

export default function PlayerDirectory({
  players,
  primaryPhotos = {},
  teams = [],
}: {
  players: PlayerWithParents[];
  primaryPhotos?: Record<string, string>;
  teams?: { id: string; name: string; season: string }[];
}) {
  // Filter / sort state
  const [query,       setQuery]       = useState("");
  const [sortIndex,   setSortIndex]   = useState(0);
  const [filterTeam,  setFilterTeam]  = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSize,  setFilterSize]  = useState("");
  const [photoOnly,   setPhotoOnly]   = useState(false);

  // Selection state
  const [selected,    setSelected]    = useState<Set<string>>(new Set());

  // Bulk operation state
  const [bulkTeam,    setBulkTeam]    = useState("");
  const [bulkError,   setBulkError]   = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();

  // Message composer state
  const [messageChannel, setMessageChannel] = useState<"email" | "text" | null>(null);

  // ── Derived filter options ───────────────────────────────────

  const availableTeams = useMemo(() => {
    const names = new Set<string>();
    players.forEach((p) => p.roster?.forEach((r) => names.add(r.teams.name)));
    return [...names].sort();
  }, [players]);

  const grades = useMemo(() => {
    const vals = new Set<string>();
    players.forEach((p) => { if (p.grade) vals.add(p.grade); });
    return [...vals].sort();
  }, [players]);

  const sizes = useMemo(() => {
    const vals = new Set<string>();
    players.forEach((p) => { if (p.shirt_size) vals.add(p.shirt_size); });
    return [...vals].sort();
  }, [players]);

  const sort = SORT_OPTIONS[sortIndex];

  const activeFilters =
    (filterTeam ? 1 : 0) + (filterGrade ? 1 : 0) +
    (filterSize ? 1 : 0) + (photoOnly ? 1 : 0);

  // ── Filtered + sorted list ───────────────────────────────────

  const processed = useMemo(() => {
    let list = [...players];

    if (query) {
      const q = normalize(query);
      list = list.filter((p) => {
        if (normalize(`${p.first_name} ${p.last_name}`).includes(q)) return true;
        return p.player_parents.some((pp) => {
          const par = pp.parents;
          return (
            normalize(`${par.first_name} ${par.last_name}`).includes(q) ||
            (par.email ?? "").toLowerCase().includes(q) ||
            (par.phone ?? "").replace(/\D/g, "").includes(q.replace(/\D/g, ""))
          );
        });
      });
    }

    if (filterTeam)  list = list.filter((p) => p.roster?.some((r) => r.teams.name === filterTeam));
    if (filterGrade) list = list.filter((p) => p.grade === filterGrade);
    if (filterSize)  list = list.filter((p) => p.shirt_size === filterSize);
    if (photoOnly)   list = list.filter((p) => !!primaryPhotos[p.id]);

    list.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return list;
  }, [players, query, filterTeam, filterGrade, filterSize, photoOnly, sort, primaryPhotos]);

  // ── Selection helpers ────────────────────────────────────────

  const visibleIds = processed.map((p) => p.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allVisibleSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => new Set([...prev, ...visibleIds]));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkError(null);
  }

  // ── Message recipients ───────────────────────────────────────

  const messageRecipients = useMemo(() => {
    const seen = new Set<string>();
    const result: { name: string; email: string | null; phone: string | null }[] = [];
    for (const pid of selected) {
      const player = players.find((p) => p.id === pid);
      if (!player) continue;
      for (const pp of player.player_parents) {
        const par = pp.parents;
        if (!seen.has(par.id)) {
          seen.add(par.id);
          result.push({
            name: `${par.first_name} ${par.last_name}`,
            email: par.email,
            phone: par.phone,
          });
        }
      }
    }
    return result;
  }, [selected, players]);

  // ── Bulk actions ─────────────────────────────────────────────

  function handleBulkDelete() {
    if (!confirm(`Delete ${selected.size} player${selected.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkDeletePlayers([...selected]);
      if (result.error) { setBulkError(result.error); return; }
      clearSelection();
    });
  }

  function handleBulkAdd() {
    if (!bulkTeam) return;
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkAddToTeam([...selected], bulkTeam);
      if (result.error) { setBulkError(result.error); return; }
      clearSelection();
    });
  }

  function handleBulkRemove() {
    if (!bulkTeam) return;
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkRemoveFromTeam([...selected], bulkTeam);
      if (result.error) { setBulkError(result.error); return; }
      clearSelection();
    });
  }

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="pb-24">
      {/* Search */}
      <input
        type="search"
        placeholder="Search by player or parent name, email, or phone…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm dark:shadow-none focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 mb-3"
      />

      {/* Sort + filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={sortIndex}
          onChange={(e) => setSortIndex(Number(e.target.value))}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
        >
          {SORT_OPTIONS.map((opt, i) => (
            <option key={i} value={i}>{opt.label}</option>
          ))}
        </select>

        {availableTeams.length > 0 && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 focus:border-blue-500 focus:outline-none ${
              filterTeam ? "border-blue-500 text-blue-700 dark:text-blue-300 font-medium" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            <option value="">All teams</option>
            {availableTeams.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {grades.length > 0 && (
          <select
            value={filterGrade}
            onChange={(e) => setFilterGrade(e.target.value)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 focus:border-blue-500 focus:outline-none ${
              filterGrade ? "border-blue-500 text-blue-700 dark:text-blue-300 font-medium" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            <option value="">All grades</option>
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}

        {sizes.length > 0 && (
          <select
            value={filterSize}
            onChange={(e) => setFilterSize(e.target.value)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 focus:border-blue-500 focus:outline-none ${
              filterSize ? "border-blue-500 text-blue-700 dark:text-blue-300 font-medium" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            <option value="">All sizes</option>
            {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        <button
          onClick={() => setPhotoOnly((v) => !v)}
          className={`rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${
            photoOnly
              ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
              : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
          }`}
        >
          Has photo
        </button>

        {activeFilters > 0 && (
          <button
            onClick={() => { setFilterTeam(""); setFilterGrade(""); setFilterSize(""); setPhotoOnly(false); }}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline"
          >
            Clear {activeFilters} filter{activeFilters !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Result count */}
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {processed.length} of {players.length} player{players.length !== 1 ? "s" : ""}
        {query ? ` matching "${query}"` : ""}
      </p>

      {/* List */}
      {processed.length === 0 ? (
        <p className="text-center py-12 text-gray-500 dark:text-gray-400">No players found.</p>
      ) : (
        <>
          {/* Select-all row */}
          <label className="flex items-center gap-2 mb-2 px-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected && !allVisibleSelected;
              }}
              onChange={toggleAll}
              className="w-4 h-4 rounded accent-blue-600"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {allVisibleSelected
                ? `Deselect all ${visibleIds.length}`
                : someSelected
                ? `${selected.size} selected — select all ${visibleIds.length} visible`
                : `Select all ${visibleIds.length} visible`}
            </span>
          </label>

          <ul className="space-y-2">
            {processed.map((player) => (
              <li
                key={player.id}
                className={`bg-white dark:bg-gray-900 rounded-xl border transition-colors ${
                  selected.has(player.id) ? "border-blue-400 bg-blue-50/30 dark:bg-blue-950/30" : "border-gray-200 dark:border-gray-700"
                }`}
              >
                <div className="flex items-start gap-3 px-4 py-4">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={selected.has(player.id)}
                    onChange={() => toggleOne(player.id)}
                    className="mt-1 w-4 h-4 rounded accent-blue-600 shrink-0"
                  />

                  {/* Photo thumbnail */}
                  <Link href={`/players/${player.id}`} className="shrink-0">
                    {primaryPhotos[player.id] ? (
                      <Image
                        src={primaryPhotos[player.id]}
                        alt={`${player.first_name} ${player.last_name}`}
                        width={40}
                        height={56}
                        className="w-10 h-14 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                      />
                    ) : (
                      <div className="w-10 h-14 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-lg">
                        👤
                      </div>
                    )}
                  </Link>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1">
                      <Link
                        href={`/players/${player.id}`}
                        className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {player.first_name} {player.last_name}
                      </Link>
                      {player.grade && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">{player.grade}</span>
                      )}
                      {player.shirt_size && (
                        <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded px-1.5 py-0.5 font-mono">
                          {player.shirt_size}
                        </span>
                      )}
                      {player.roster?.map((r) => (
                        <span
                          key={r.team_id}
                          className="text-xs bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded px-1.5 py-0.5"
                        >
                          {r.teams.name}
                        </span>
                      ))}
                    </div>

                    {player.date_of_birth && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        DOB:{" "}
                        {new Date(player.date_of_birth + "T00:00:00").toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric", year: "numeric" }
                        )}
                      </p>
                    )}

                    {player.player_parents.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {player.player_parents.map((pp) => {
                          const par = pp.parents;
                          return (
                            <div
                              key={par.id}
                              className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm"
                            >
                              <span className="font-medium text-gray-700 dark:text-gray-300">
                                {par.first_name} {par.last_name}
                              </span>
                              {par.phone && (
                                <a href={`tel:${par.phone}`} className="text-blue-600 hover:underline tabular-nums">
                                  {par.phone}
                                </a>
                              )}
                              {par.email && (
                                <a href={`mailto:${par.email}`} className="text-blue-600 hover:underline truncate max-w-[240px]">
                                  {par.email}
                                </a>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Row actions */}
                  <div className="flex items-center gap-2 shrink-0 text-sm">
                    <Link href={`/players/${player.id}/edit`} className="text-blue-600 hover:underline">
                      Edit
                    </Link>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <DeletePlayerButton
                      id={player.id}
                      name={`${player.first_name} ${player.last_name}`}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Floating bulk action bar ─────────────────────────── */}
      {someSelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100vw-2rem)] max-w-2xl">
          <div className="bg-gray-900 text-white rounded-2xl shadow-2xl px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            {/* Count + clear */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-sm font-semibold">
                {selected.size} selected
              </span>
              <button
                onClick={clearSelection}
                className="text-gray-400 hover:text-white text-lg leading-none"
                title="Clear selection"
              >
                ×
              </button>
            </div>

            <div className="w-px h-5 bg-gray-700 shrink-0" />

            {/* Message */}
            <button
              onClick={() => setMessageChannel("email")}
              className="text-sm px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              Email
            </button>
            <button
              onClick={() => setMessageChannel("text")}
              className="text-sm px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
            >
              Text
            </button>

            {teams.length > 0 && (
              <>
                <div className="w-px h-5 bg-gray-700 shrink-0" />

                {/* Team picker shared by add + remove */}
                <select
                  value={bulkTeam}
                  onChange={(e) => setBulkTeam(e.target.value)}
                  className="rounded-lg bg-gray-800 border border-gray-700 px-2 py-1 text-sm text-white focus:outline-none focus:border-gray-500"
                >
                  <option value="">Pick team…</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.season ? ` · ${t.season}` : ""}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleBulkAdd}
                  disabled={!bulkTeam || pending}
                  className="text-sm px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={handleBulkRemove}
                  disabled={!bulkTeam || pending}
                  className="text-sm px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 disabled:opacity-40 transition-colors"
                >
                  Remove
                </button>
              </>
            )}

            <div className="w-px h-5 bg-gray-700 shrink-0" />

            {/* Delete */}
            <button
              onClick={handleBulkDelete}
              disabled={pending}
              className="text-sm px-2.5 py-1 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-40 transition-colors"
            >
              Delete
            </button>

            {/* Error */}
            {bulkError && (
              <p className="w-full text-xs text-red-400 mt-1">{bulkError}</p>
            )}
          </div>
        </div>
      )}

      {/* ── Message composer modal ───────────────────────────── */}
      {messageChannel && (
        <MessageComposer
          recipients={messageRecipients}
          channel={messageChannel}
          onClose={() => setMessageChannel(null)}
        />
      )}
    </div>
  );
}
