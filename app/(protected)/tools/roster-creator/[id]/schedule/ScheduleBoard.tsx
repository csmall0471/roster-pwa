"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { setTeamSchedule, updateScheduleConfig } from "../../actions";
import { NIGHTS } from "../../group/engine";
import { toCsv } from "../../export-csv";
import { type ScheduleConfig, timeSlots, fmtTime } from "../../schedule";

export type SchedTeam = {
  id: string;
  name: string;
  divisionId: string;
  coach: string;
  day: string | null;
  time: string | null;
  field: string | null;
};

export default function ScheduleBoard({
  seasonId,
  seasonName,
  divisions,
  teams: initialTeams,
  config: initialConfig,
}: {
  seasonId: string;
  seasonName: string;
  divisions: { id: string; name: string }[];
  teams: SchedTeam[];
  config: ScheduleConfig;
}) {
  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [day, setDay] = useState(NIGHTS[0]);
  const [cfg, setCfg] = useState<ScheduleConfig>(initialConfig);
  const [teams, setTeams] = useState<SchedTeam[]>(initialTeams);
  const [newField, setNewField] = useState("");
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync when the server sends fresh data (after a move / router.refresh).
  const sig = initialTeams.map((t) => `${t.id}:${t.day ?? ""}:${t.time ?? ""}:${t.field ?? ""}`).join("|");
  const [seenSig, setSeenSig] = useState(sig);
  if (sig !== seenSig) {
    setSeenSig(sig);
    setTeams(initialTeams);
  }

  const divTeams = useMemo(() => teams.filter((t) => t.divisionId === divisionId), [teams, divisionId]);
  const slots = useMemo(() => timeSlots(cfg), [cfg]);

  // Grid columns = configured fields, plus any field a team already references
  // (so nothing is hidden if a field was removed from the config).
  const fields = useMemo(() => {
    const used = divTeams.map((t) => t.field).filter((f): f is string => !!f);
    return [...new Set([...cfg.fields, ...used])];
  }, [cfg.fields, divTeams]);

  const dayCount = (d: string) => divTeams.filter((t) => t.day === d).length;
  const noDay = divTeams.filter((t) => !t.day);
  const unplaced = divTeams.filter((t) => t.day === day && (!t.time || !t.field));

  // Coach double-booked: same coach has 2+ teams at the same day + time.
  const coachClash = useMemo(() => {
    const byTimeCoach = new Map<string, Map<string, string[]>>();
    for (const t of divTeams) {
      if (t.day !== day || !t.time || !t.coach) continue;
      if (!byTimeCoach.has(t.time)) byTimeCoach.set(t.time, new Map());
      const m = byTimeCoach.get(t.time)!;
      if (!m.has(t.coach)) m.set(t.coach, []);
      m.get(t.coach)!.push(t.id);
    }
    const clash = new Set<string>();
    for (const m of byTimeCoach.values()) for (const ids of m.values()) if (ids.length > 1) ids.forEach((id) => clash.add(id));
    return clash;
  }, [divTeams, day]);

  const cellTeams = (time: string, field: string) =>
    divTeams.filter((t) => t.day === day && t.time === time && t.field === field);

  async function place(teamId: string, d: string | null, time: string | null, field: string | null) {
    setError(null);
    const prev = teams.find((t) => t.id === teamId);
    setTeams((ts) => ts.map((t) => (t.id === teamId ? { ...t, day: d, time, field } : t)));
    try {
      await setTeamSchedule(seasonId, teamId, d, time, field);
    } catch (e) {
      if (prev) setTeams((ts) => ts.map((t) => (t.id === teamId ? prev : t)));
      setError(e instanceof Error ? e.message : "Failed to update.");
    }
  }

  // Drop a team onto a day tab → move it to that day, keeping its time/field.
  function moveToDay(teamId: string, d: string) {
    const t = teams.find((x) => x.id === teamId);
    place(teamId, d, t?.time ?? null, t?.field ?? null);
    setDay(d);
  }

  function downloadScheduleCsv() {
    const order = new Map(divisions.map((d, i) => [d.id, i]));
    const dayIdx = (d: string | null) => (d ? NIGHTS.indexOf(d) : 99);
    const sorted = [...teams].sort(
      (a, b) =>
        (order.get(a.divisionId) ?? 0) - (order.get(b.divisionId) ?? 0) ||
        dayIdx(a.day) - dayIdx(b.day) ||
        (a.time ?? "").localeCompare(b.time ?? "") ||
        (a.field ?? "").localeCompare(b.field ?? "") ||
        a.name.localeCompare(b.name)
    );
    const divNameOf = new Map(divisions.map((d) => [d.id, d.name]));
    const csv = toCsv(
      ["Division", "Team", "Coach", "Day", "Time", "Field"],
      sorted.map((t) => [
        divNameOf.get(t.divisionId) ?? "",
        t.name,
        t.coach,
        t.day ?? "",
        t.time ? fmtTime(t.time) : "",
        t.field ?? "",
      ])
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "practice-schedule.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function saveCfg(next: ScheduleConfig) {
    setCfg(next);
    try {
      await updateScheduleConfig(seasonId, next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save settings.");
    }
  }
  const addField = () => {
    const f = newField.trim();
    if (!f || cfg.fields.includes(f)) return;
    setNewField("");
    saveCfg({ ...cfg, fields: [...cfg.fields, f] });
  };
  const removeField = (f: string) => saveCfg({ ...cfg, fields: cfg.fields.filter((x) => x !== f) });

  const dragProps = (teamId: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => e.dataTransfer.setData("text/plain", teamId),
  });
  const dropProps = (onDrop: (teamId: string) => void) => ({
    onDragOver: (e: React.DragEvent) => e.preventDefault(),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      if (id) onDrop(id);
    },
  });

  function Chip({ t, clash }: { t: SchedTeam; clash?: boolean }) {
    return (
      <div
        {...dragProps(t.id)}
        className={`cursor-grab rounded-md border px-2 py-1 text-xs shadow-sm active:cursor-grabbing ${
          clash
            ? "border-amber-400 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40"
            : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800"
        }`}
        title={clash ? "Coach is double-booked at this time" : undefined}
      >
        <div className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</div>
        {t.coach && <div className="text-[11px] text-gray-500 dark:text-gray-400">{t.coach}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/tools/roster-creator/${seasonId}`}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← {seasonName}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Practice schedule</h1>
            <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-gray-400">
              Pick a day, then drag each team onto a field and time — or drop it on another day tab to
              move it. Two teams in the same field+time turn red; a coach double-booked at the same time
              turns amber.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" onClick={downloadScheduleCsv}
              className="rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800">
              Download CSV
            </button>
            <a href={`/tools/roster-creator/${seasonId}/schedule/print`} target="_blank" rel="noopener"
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
              Print / PDF
            </a>
          </div>
        </div>
      </div>

      {/* Settings: fields + time window */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">First slot</span>
            <input type="time" value={cfg.start} onChange={(e) => saveCfg({ ...cfg, start: e.target.value })}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ends by</span>
            <input type="time" value={cfg.end} onChange={(e) => saveCfg({ ...cfg, end: e.target.value })}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Slot (min)</span>
            <input type="number" min={15} step={15} value={cfg.slot} onChange={(e) => saveCfg({ ...cfg, slot: +e.target.value || 60 })}
              className="w-20 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Fields</span>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {cfg.fields.map((f) => (
              <span key={f} className="inline-flex items-center gap-1 rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-200">
                {f}
                <button type="button" onClick={() => removeField(f)} className="text-gray-400 hover:text-red-500">×</button>
              </span>
            ))}
            <input
              value={newField}
              onChange={(e) => setNewField(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addField())}
              placeholder="Add field…"
              className="w-32 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs"
            />
            <button type="button" onClick={addField} disabled={!newField.trim()}
              className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Add</button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </section>

      {/* Division + day tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-600 dark:text-gray-300">Division</span>
          <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm">
            {divisions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-1">
          {NIGHTS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDay(d)}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragOverDay !== d) setDragOverDay(d);
              }}
              onDragLeave={() => setDragOverDay((cur) => (cur === d ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverDay(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) moveToDay(id, d);
              }}
              className={`rounded-md px-2.5 py-1 text-xs font-semibold ${
                dragOverDay === d
                  ? "bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-400 text-blue-700 dark:text-blue-200"
                  : d === day
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
              }`}
            >
              {d.slice(0, 3)} {dayCount(d) > 0 && <span className={d === day ? "text-blue-100" : "text-gray-400"}>{dayCount(d)}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-6 text-center text-sm text-gray-500">
          Add at least one field above to start scheduling.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-max gap-px rounded-lg bg-gray-200 dark:bg-gray-800 p-px"
            style={{ gridTemplateColumns: `5rem repeat(${fields.length}, minmax(140px, 1fr))` }}
          >
            <div className="bg-gray-50 dark:bg-gray-900" />
            {fields.map((f) => (
              <div key={f} className="bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                {f}
              </div>
            ))}
            {slots.map((slot) => (
              <Fragment key={slot}>
                <div className="bg-gray-50 dark:bg-gray-900 px-2 py-2 text-right text-xs text-gray-500 dark:text-gray-400">
                  {fmtTime(slot)}
                </div>
                {fields.map((field) => {
                  const here = cellTeams(slot, field);
                  const conflict = here.length > 1;
                  return (
                    <div
                      key={field}
                      {...dropProps((id) => place(id, day, slot, field))}
                      className={`min-h-[44px] space-y-1 p-1 ${
                        conflict ? "bg-red-50 dark:bg-red-950/30" : "bg-white dark:bg-gray-950"
                      }`}
                    >
                      {here.map((t) => <Chip key={t.id} t={t} clash={coachClash.has(t.id)} />)}
                    </div>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {/* Trays */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Tray
          title={`${day} — not placed`}
          count={unplaced.length}
          hint="Teams on this day without a field/time. Drag onto the grid, or drop here to unplace."
          {...dropProps((id) => place(id, day, null, null))}
        >
          {unplaced.map((t) => <Chip key={t.id} t={t} clash={coachClash.has(t.id)} />)}
        </Tray>
        <Tray
          title="No day yet"
          count={noDay.length}
          hint={`Teams with no practice day. Drag onto the ${day} grid to assign, or drop here to clear a team's day.`}
          {...dropProps((id) => place(id, null, null, null))}
        >
          {noDay.map((t) => <Chip key={t.id} t={t} />)}
        </Tray>
      </div>
    </div>
  );
}

function Tray({
  title,
  count,
  hint,
  children,
  ...drop
}: {
  title: string;
  count: number;
  hint: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...drop} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">{title}</span>
        <span className="text-xs text-gray-400">{count}</span>
      </div>
      <p className="mt-0.5 mb-2 text-[11px] text-gray-400">{hint}</p>
      <div className="flex flex-wrap gap-2">
        {children}
        {count === 0 && <span className="text-xs text-gray-400 italic">none</span>}
      </div>
    </div>
  );
}
