"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addDivision, movePlayer } from "../actions";
import { isNoRequest } from "../fields";

export type DivisionRow = { id: string; name: string; position: number };
export type PlayerRow = {
  id: string;
  division_id: string | null;
  first_name: string;
  last_name: string;
  gender: string;
  age_group: string;
  school: string;
  coach_first: string;
  coach_last: string;
  team_name: string;
  buddy_first: string;
  buddy_last: string;
  practice_nights: string;
  package_name: string;
};

const UNASSIGNED = "__unassigned__";
const PREVIEW_LIMIT = 10;

function reqText(...parts: string[]) {
  return parts.filter((p) => p && !isNoRequest(p)).join(" ").trim();
}

export default function SeasonView({
  seasonId,
  divisions,
  players,
}: {
  seasonId: string;
  divisions: DivisionRow[];
  players: PlayerRow[];
}) {
  const router = useRouter();
  const [newDivision, setNewDivision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddDivision() {
    const name = newDivision.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await addDivision(seasonId, name);
      setNewDivision("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add division.");
    } finally {
      setBusy(false);
    }
  }

  async function handleMove(playerId: string, value: string) {
    setError(null);
    try {
      await movePlayer(seasonId, playerId, value === UNASSIGNED ? null : value);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move player.");
    }
  }

  const byDivision = new Map<string, PlayerRow[]>();
  byDivision.set(UNASSIGNED, []);
  for (const d of divisions) byDivision.set(d.id, []);
  for (const p of players) {
    const key = p.division_id && byDivision.has(p.division_id) ? p.division_id : UNASSIGNED;
    byDivision.get(key)!.push(p);
  }

  const sections = [
    ...divisions.map((d) => ({ id: d.id, name: d.name })),
    { id: UNASSIGNED, name: "Unassigned" },
  ].filter((s) => s.id !== UNASSIGNED || byDivision.get(UNASSIGNED)!.length > 0);

  return (
    <details className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <summary className="px-4 py-3 cursor-pointer text-sm font-semibold text-gray-900 dark:text-white">
        Review &amp; fix divisions
        <span className="ml-2 font-normal text-gray-400">— optional</span>
      </summary>

      <div className="px-4 pb-4 space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Players were sorted into divisions automatically from the &ldquo;package&rdquo; column of
          your signup. If someone landed in the wrong one — e.g. a kid playing up an age group — move
          them to the right division below. If everything looks right, you can skip this and go
          straight to <strong>Resolve requests</strong>.
        </p>

        {/* Add division */}
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Add a division</span>
            <input
              value={newDivision}
              onChange={(e) => setNewDivision(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddDivision()}
              placeholder="e.g. Peoria 10U Boys"
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 w-64"
            />
          </label>
          <button
            type="button"
            onClick={handleAddDivision}
            disabled={busy || !newDivision.trim()}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="space-y-3">
          {sections.map((section) => {
            const all = byDivision.get(section.id) ?? [];
            const isOpen = expanded.has(section.id);
            const shown = isOpen ? all : all.slice(0, PREVIEW_LIMIT);
            const hasMore = all.length > PREVIEW_LIMIT;
            return (
              <div key={section.id} className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(section.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
                >
                  <span className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 12 12" className={`text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} aria-hidden="true">
                      <path d="M4 2.5L7.5 6L4 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                    </svg>
                    <span className="font-semibold text-gray-900 dark:text-white">{section.name}</span>
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {all.length} {all.length === 1 ? "player" : "players"}
                  </span>
                </button>

                {all.length > 0 && (
                  <div className="relative">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-white dark:bg-gray-900">
                          <tr>
                            {["Player", "Age", "Coach req.", "Team req.", "Buddy req.", "Practice nights", "Move to"].map((h) => (
                              <th key={h} className="whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                          {shown.map((p) => (
                            <tr key={p.id} className="bg-white dark:bg-gray-900">
                              <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-white">
                                {p.first_name} {p.last_name}
                              </td>
                              <td className="whitespace-nowrap px-3 py-2 text-gray-600 dark:text-gray-300">{p.age_group || "—"}</td>
                              <Cell value={reqText(p.coach_first, p.coach_last)} />
                              <Cell value={reqText(p.team_name)} />
                              <Cell value={reqText(p.buddy_first, p.buddy_last)} />
                              <Cell value={reqText(p.practice_nights)} />
                              <td className="whitespace-nowrap px-3 py-2">
                                <select
                                  value={p.division_id ?? UNASSIGNED}
                                  onChange={(e) => handleMove(p.id, e.target.value)}
                                  className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs text-gray-900 dark:text-gray-100"
                                >
                                  <option value={UNASSIGNED}>Unassigned</option>
                                  {divisions.map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {hasMore && !isOpen && (
                      <div className="pointer-events-none absolute bottom-9 inset-x-0 h-10 bg-gradient-to-t from-white dark:from-gray-900 to-transparent" />
                    )}
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => toggle(section.id)}
                        className="w-full px-3 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800 border-t border-gray-100 dark:border-gray-800"
                      >
                        {isOpen ? "Show less" : `Show all ${all.length} players`}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function Cell({ value }: { value: string }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2 ${value ? "text-gray-800 dark:text-gray-200" : "text-gray-300 dark:text-gray-600"}`}>
      {value || "—"}
    </td>
  );
}
