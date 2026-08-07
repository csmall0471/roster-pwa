"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Image from "next/image";
import {
  RATING_CATEGORIES,
  RATING_DEFAULT,
  type RankPlayer,
  type RatingKey,
  type RatingValues,
} from "@/lib/types";
import { savePlayerRating } from "../actions";

// ── Helpers ───────────────────────────────────────────────────

function defaults(): RatingValues {
  const v = {} as RatingValues;
  for (const { key } of RATING_CATEGORIES) v[key] = RATING_DEFAULT;
  return v;
}

function scoreOf(v: RatingValues): number {
  return RATING_CATEGORIES.reduce((sum, { key }) => sum + (v[key] ?? RATING_DEFAULT), 0);
}

const MAX_SCORE = RATING_CATEGORIES.length * 10;

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// Colour the score from red (low) through amber to green (high).
function scoreColor(avg: number): string {
  if (avg >= 8) return "text-green-600 dark:text-green-400";
  if (avg >= 6) return "text-blue-600 dark:text-blue-400";
  if (avg >= 4) return "text-amber-600 dark:text-amber-400";
  return "text-gray-500 dark:text-gray-400";
}

// ── Component ─────────────────────────────────────────────────

export default function PlayerRanking({
  players,
  initialRatings,
}: {
  players: RankPlayer[];
  initialRatings: Record<string, RatingValues>;
}) {
  // Live rating values, keyed by player id. Missing players start neutral.
  const seed = useMemo(() => {
    const m: Record<string, RatingValues> = {};
    for (const p of players) m[p.id] = { ...defaults(), ...initialRatings[p.id] };
    return m;
  }, [players, initialRatings]);

  // The ref is the source of truth (updated synchronously in `change`); state
  // mirrors it to drive re-renders. This lets `commit` (slider release) read the
  // latest values with no dependence on effect-flush timing.
  const ratingsRef = useRef(seed);
  const [ratings, setRatings] = useState<Record<string, RatingValues>>(seed);

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    for (const p of players) m[p.id] = `${p.last_name} ${p.first_name}`.toLowerCase();
    return m;
  }, [players]);

  // Ranked id order — recomputed only when a slider is released (not mid-drag),
  // so rows don't shuffle under the cursor while you're dragging.
  const computeOrder = (map: Record<string, RatingValues>) =>
    players
      .map((p) => p.id)
      .sort((a, b) => {
        const d = scoreOf(map[b] ?? defaults()) - scoreOf(map[a] ?? defaults());
        return d !== 0 ? d : (nameOf[a] ?? "").localeCompare(nameOf[b] ?? "");
      });

  const [order, setOrder] = useState<string[]>(() => computeOrder(seed));

  // Filters
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState("");
  const [selectedAges, setSelectedAges] = useState<Set<number>>(new Set());
  const [sortMode, setSortMode] = useState<"rank" | "az">("rank");

  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [, startSave] = useTransition();

  const sports = useMemo(() => {
    const s = new Set<string>();
    players.forEach((p) => p.teams.forEach((t) => t.sport && s.add(t.sport)));
    return [...s].sort();
  }, [players]);

  const ages = useMemo(() => {
    const s = new Set<number>();
    players.forEach((p) => {
      const a = calcAge(p.date_of_birth);
      if (a != null) s.add(a);
    });
    return [...s].sort((a, b) => a - b);
  }, [players]);

  // Apply filters, then order (ranked or alphabetical). Rank number is the
  // player's position within the list currently on screen.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = players.filter((p) => {
      if (q && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false;
      if (sport && !p.teams.some((t) => t.sport === sport)) return false;
      if (selectedAges.size) {
        const a = calcAge(p.date_of_birth);
        if (a == null || !selectedAges.has(a)) return false;
      }
      return true;
    });

    if (sortMode === "az") {
      list = [...list].sort((a, b) =>
        (nameOf[a.id] ?? "").localeCompare(nameOf[b.id] ?? "")
      );
    } else {
      const rank: Record<string, number> = {};
      order.forEach((id, i) => (rank[id] = i));
      list = [...list].sort((a, b) => (rank[a.id] ?? 0) - (rank[b.id] ?? 0));
    }
    return list;
  }, [players, query, sport, selectedAges, sortMode, order, nameOf]);

  const activeFilters = (sport ? 1 : 0) + (selectedAges.size ? 1 : 0) + (query ? 1 : 0);

  function toggleAge(a: number) {
    setSelectedAges((prev) => {
      const n = new Set(prev);
      if (n.has(a)) n.delete(a);
      else n.add(a);
      return n;
    });
  }

  // ── Slider handlers ─────────────────────────────────────────

  // Live update (during drag): move the number, but keep row order frozen.
  function change(playerId: string, key: RatingKey, value: number) {
    const cur = ratingsRef.current[playerId] ?? defaults();
    ratingsRef.current = { ...ratingsRef.current, [playerId]: { ...cur, [key]: value } };
    setRatings(ratingsRef.current);
  }

  // Release: re-rank the list and persist this player's row.
  function commit(playerId: string) {
    setOrder(computeOrder(ratingsRef.current));
    const values = ratingsRef.current[playerId];
    setSaving((s) => new Set(s).add(playerId));
    startSave(async () => {
      await savePlayerRating(playerId, values);
      setSaving((s) => {
        const n = new Set(s);
        n.delete(playerId);
        return n;
      });
    });
  }

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="pb-16">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        Rate each player 1–10 on five equally-weighted qualities. Drag the sliders and
        players re-rank by their combined score. Only you can see these.
      </p>

      {/* Filter / sort bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="search"
          placeholder="Search players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[180px] rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-900 placeholder-gray-400 dark:placeholder-gray-500 focus:border-blue-500 focus:outline-none"
        />

        {sports.length > 0 && (
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className={`rounded-lg border px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 focus:border-blue-500 focus:outline-none ${
              sport ? "border-blue-500 text-blue-700 dark:text-blue-300 font-medium" : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200"
            }`}
          >
            <option value="">All sports</option>
            {sports.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}

        {ages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm text-gray-600 dark:text-gray-300">Age:</span>
            {ages.map((a) => {
              const on = selectedAges.has(a);
              return (
                <button
                  key={a}
                  type="button"
                  onClick={() => toggleAge(a)}
                  aria-pressed={on}
                  className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                    on
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-medium"
                      : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  {a}
                </button>
              );
            })}
          </div>
        )}

        <select
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as "rank" | "az")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 px-2.5 py-1.5 text-sm bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:border-blue-500 focus:outline-none"
          title="A→Z keeps rows still while you rate; By rank re-sorts by score"
        >
          <option value="rank">Sort by rank</option>
          <option value="az">Sort A → Z</option>
        </select>

        {activeFilters > 0 && (
          <button
            onClick={() => { setQuery(""); setSport(""); setSelectedAges(new Set()); }}
            className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 underline"
          >
            Clear {activeFilters} filter{activeFilters !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
        {visible.length} of {players.length} player{players.length !== 1 ? "s" : ""}
      </p>

      {visible.length === 0 ? (
        <p className="text-center py-12 text-gray-500 dark:text-gray-400">No players match.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((p, i) => {
            const v = ratings[p.id] ?? defaults();
            const total = scoreOf(v);
            const avg = total / RATING_CATEGORIES.length;
            return (
              <li
                key={p.id}
                className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                  {/* Rank + identity + score */}
                  <div className="flex items-center gap-3 md:w-64 shrink-0">
                    <span className="w-7 text-center text-lg font-bold tabular-nums text-gray-400 dark:text-gray-500">
                      {sortMode === "rank" ? i + 1 : "·"}
                    </span>
                    {p.photo ? (
                      <Image
                        src={p.photo}
                        alt={`${p.first_name} ${p.last_name}`}
                        width={36}
                        height={48}
                        className="w-9 h-12 object-cover rounded-lg border border-gray-200 dark:border-gray-700 shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-12 rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600">
                        👤
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {p.first_name} {p.last_name}
                      </p>
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-lg font-bold tabular-nums ${scoreColor(avg)}`}>
                          {avg.toFixed(1)}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                          {total}/{MAX_SCORE}
                        </span>
                        {saving.has(p.id) && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">saving…</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-5 gap-y-2">
                    {RATING_CATEGORIES.map(({ key, label, help }) => (
                      <div key={key} className="flex items-center gap-2">
                        <label
                          htmlFor={`${p.id}-${key}`}
                          title={help}
                          className="w-24 shrink-0 text-xs text-gray-600 dark:text-gray-400 truncate cursor-help"
                        >
                          {label}
                        </label>
                        <input
                          id={`${p.id}-${key}`}
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={v[key]}
                          aria-label={`${label} for ${p.first_name} ${p.last_name}`}
                          onChange={(e) => change(p.id, key, Number(e.target.value))}
                          onPointerUp={() => commit(p.id)}
                          onKeyUp={() => commit(p.id)}
                          onBlur={() => commit(p.id)}
                          className="flex-1 min-w-0 accent-blue-600 cursor-pointer"
                        />
                        <span className="w-5 text-right text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                          {v[key]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
