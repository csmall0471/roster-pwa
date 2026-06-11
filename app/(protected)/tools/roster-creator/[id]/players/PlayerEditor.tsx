"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { addPlayer, updatePlayer, deletePlayer } from "../../actions";
import { isNoRequest } from "../../fields";

export type EditDivision = { id: string; name: string };
export type EditPlayer = {
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
};

const UNASSIGNED = "__unassigned__";
const PREVIEW_LIMIT = 25;

type Form = {
  first_name: string;
  last_name: string;
  division_id: string;
  gender: string;
  age_group: string;
  school: string;
  coach_first: string;
  coach_last: string;
  team_name: string;
  buddy_first: string;
  buddy_last: string;
  practice_nights: string;
};

const EMPTY: Form = {
  first_name: "", last_name: "", division_id: "", gender: "", age_group: "", school: "",
  coach_first: "", coach_last: "", team_name: "", buddy_first: "", buddy_last: "", practice_nights: "",
};

const toForm = (p: EditPlayer): Form => ({
  first_name: p.first_name, last_name: p.last_name, division_id: p.division_id ?? "",
  gender: p.gender, age_group: p.age_group, school: p.school,
  coach_first: p.coach_first, coach_last: p.coach_last, team_name: p.team_name,
  buddy_first: p.buddy_first, buddy_last: p.buddy_last, practice_nights: p.practice_nights,
});

function reqText(...parts: string[]) {
  return parts.filter((p) => p && !isNoRequest(p)).join(" ").trim();
}

export default function PlayerEditor({
  seasonId,
  divisions,
  players,
}: {
  seasonId: string;
  divisions: EditDivision[];
  players: EditPlayer[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState<Form>(EMPTY);

  const divName = useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? players.filter((p) => `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    : players;

  const byDivision = useMemo(() => {
    const m = new Map<string, EditPlayer[]>();
    m.set(UNASSIGNED, []);
    for (const d of divisions) m.set(d.id, []);
    for (const p of filtered) {
      const key = p.division_id && m.has(p.division_id) ? p.division_id : UNASSIGNED;
      m.get(key)!.push(p);
    }
    return m;
  }, [filtered, divisions]);

  const sections = [
    ...divisions.map((d) => ({ id: d.id, name: d.name })),
    { id: UNASSIGNED, name: "Unassigned" },
  ].filter((s) => (byDivision.get(s.id) ?? []).length > 0 || s.id !== UNASSIGNED);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveAdd() {
    const ok = await run(() =>
      addPlayer(seasonId, addForm.division_id || null, addForm)
    );
    if (ok) setAddForm({ ...EMPTY, division_id: addForm.division_id });
  }

  async function saveEdit(id: string) {
    const ok = await run(() => updatePlayer(seasonId, id, { ...form, division_id: form.division_id || null }));
    if (ok) setEditingId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
          Players ({players.length})
        </h2>
        <button
          type="button"
          onClick={() => setAdding((a) => !a)}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
        >
          + Add player
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search players…"
          className="ml-auto w-56 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {adding && (
        <div className="rounded-xl border border-blue-200 dark:border-blue-900/50 bg-blue-50/40 dark:bg-blue-950/20 p-4">
          <p className="text-sm font-semibold text-gray-900 dark:text-white mb-3">New player</p>
          <PlayerFormFields value={addForm} onChange={setAddForm} divisions={divisions} />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={busy || (!addForm.first_name.trim() && !addForm.last_name.trim())}
              onClick={saveAdd}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add player
            </button>
            <button type="button" onClick={() => setAdding(false)} className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              Close
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {sections.map((section) => {
          const all = byDivision.get(section.id) ?? [];
          const isOpen = expanded.has(section.id) || !!q;
          const shown = isOpen ? all : all.slice(0, PREVIEW_LIMIT);
          const hasMore = all.length > PREVIEW_LIMIT && !q;
          return (
            <div key={section.id} className="rounded-lg border border-gray-200 dark:border-gray-800 overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(section.id)}
                className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 text-left"
              >
                <span className="font-semibold text-gray-900 dark:text-white">{section.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {all.length} {all.length === 1 ? "player" : "players"}
                </span>
              </button>
              {all.length > 0 && (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {shown.map((p) => (
                    <li key={p.id} className="px-3 py-2">
                      {editingId === p.id ? (
                        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/40 p-3">
                          <PlayerFormFields value={form} onChange={setForm} divisions={divisions} />
                          <div className="mt-3 flex items-center gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveEdit(p.id)}
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button type="button" onClick={() => setEditingId(null)} className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 text-sm">
                          <div className="min-w-0 flex-1">
                            <span className="font-medium text-gray-900 dark:text-white">
                              {p.first_name} {p.last_name}
                            </span>
                            {p.age_group && <span className="ml-2 text-xs text-gray-400">{p.age_group}</span>}
                            <RequestSummary p={p} divName={divName} />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setForm(toForm(p));
                              setEditingId(p.id);
                            }}
                            className="shrink-0 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (confirm(`Remove ${p.first_name} ${p.last_name}?`)) run(() => deletePlayer(seasonId, p.id));
                            }}
                            className="shrink-0 text-gray-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                            title="Remove player"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
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
          );
        })}
      </div>
    </div>
  );
}

function RequestSummary({ p, divName }: { p: EditPlayer; divName: Map<string, string> }) {
  const coach = reqText(p.coach_first, p.coach_last);
  const buddy = reqText(p.buddy_first, p.buddy_last);
  const nights = reqText(p.practice_nights);
  const bits = [
    coach && `coach: ${coach}`,
    buddy && `buddy: ${buddy}`,
    nights && `nights: ${nights}`,
    p.division_id && divName.has(p.division_id) ? null : "no division",
  ].filter(Boolean);
  if (bits.length === 0) return null;
  return <span className="ml-2 text-xs text-gray-400">· {bits.join(" · ")}</span>;
}

function PlayerFormFields({
  value,
  onChange,
  divisions,
}: {
  value: Form;
  onChange: (f: Form) => void;
  divisions: EditDivision[];
}) {
  const set = (k: keyof Form, v: string) => onChange({ ...value, [k]: v });
  const input = (k: keyof Form, label: string, ph = "") => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</span>
      <input
        value={value[k]}
        onChange={(e) => set(k, e.target.value)}
        placeholder={ph}
        className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
      />
    </label>
  );
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {input("first_name", "First name")}
      {input("last_name", "Last name")}
      <label className="flex flex-col gap-1">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Division</span>
        <select
          value={value.division_id}
          onChange={(e) => set("division_id", e.target.value)}
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-sm text-gray-900 dark:text-gray-100"
        >
          <option value="">Unassigned</option>
          {divisions.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </label>
      {input("age_group", "Age group", "U10")}
      {input("school", "School")}
      {input("coach_first", "Coach first")}
      {input("coach_last", "Coach last")}
      {input("buddy_first", "Buddy first")}
      {input("buddy_last", "Buddy last")}
      {input("practice_nights", "Practice nights", "Monday, Tuesday")}
      {input("team_name", "Team request")}
    </div>
  );
}
