import { Fragment } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { selectAll } from "../../../db";
import { NIGHTS } from "../../../group/engine";
import { normalizeSchedule, timeSlots, fmtTime } from "../../../schedule";
import PrintButton from "../../teams/print/PrintButton";

const PALETTE = [
  "from-blue-500 to-indigo-600",
  "from-emerald-500 to-teal-600",
  "from-violet-500 to-purple-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-cyan-500 to-sky-600",
];

type Team = { id: string; divisionId: string; name: string; coach: string; day: string | null; time: string | null; field: string | null };

export default async function SchedulePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase
    .from("tb_seasons")
    .select("name, sport, schedule_config")
    .eq("id", id)
    .maybeSingle();
  if (!season) notFound();

  const [{ data: divisions }, { data: teams }, players, { data: coaches }] = await Promise.all([
    supabase.from("tb_divisions").select("id, name, position").eq("season_id", id).order("position"),
    supabase.from("tb_teams").select("id, division_id, name, practice_night, practice_time, field, position").eq("season_id", id).order("position"),
    selectAll((from, to) =>
      supabase.from("tb_players").select("team_id, resolved_coach_id").eq("season_id", id).order("id").range(from, to)
    ),
    supabase.from("tb_coaches").select("id, name").eq("season_id", id),
  ]);

  const coachName = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const votes = new Map<string, Map<string, number>>();
  for (const p of players) {
    const tid = p.team_id as string | null;
    const cid = p.resolved_coach_id as string | null;
    if (!tid || !cid) continue;
    if (!votes.has(tid)) votes.set(tid, new Map());
    const m = votes.get(tid)!;
    m.set(cid, (m.get(cid) ?? 0) + 1);
  }
  const domCoach = (tid: string) => {
    const m = votes.get(tid);
    if (!m) return "";
    let best = "", n = -1;
    for (const [c, v] of m) if (v > n) { n = v; best = c; }
    return coachName.get(best) ?? "";
  };

  const all: Team[] = (teams ?? []).map((t) => ({
    id: t.id as string,
    divisionId: t.division_id as string,
    name: t.name as string,
    coach: domCoach(t.id as string),
    day: (t.practice_night as string | null) ?? null,
    time: (t.practice_time as string | null) ?? null,
    field: (t.field as string | null) ?? null,
  }));
  const cfg = normalizeSchedule(season.schedule_config as Parameters<typeof normalizeSchedule>[0]);

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      <style>{`@media print { header { display: none !important; } main { padding: 0 !important; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } .break-avoid { break-inside: avoid; } }`}</style>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 px-8 py-7 text-white shadow-lg break-avoid">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Practice Schedule</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">{season.name}</h1>
            {season.sport && <p className="mt-1 text-lg font-medium text-white/80">{season.sport}</p>}
          </div>
          <div className="print:hidden"><PrintButton /></div>
        </div>
      </div>

      <div className="mt-8 space-y-10">
        {(divisions ?? []).map((d, di) => {
          const grad = PALETTE[di % PALETTE.length];
          const divTeams = all.filter((t) => t.divisionId === d.id);
          const scheduled = divTeams.filter((t) => t.day && t.time && t.field);
          const unscheduled = divTeams.filter((t) => !(t.day && t.time && t.field));
          const days = NIGHTS.filter((day) => scheduled.some((t) => t.day === day));

          return (
            <section key={d.id as string} className="break-avoid">
              <h2 className="mb-3 text-xl font-extrabold text-gray-900 dark:text-white">{d.name as string}</h2>

              {days.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No teams scheduled yet.</p>
              ) : (
                <div className="space-y-5">
                  {days.map((day) => {
                    const dayTeams = scheduled.filter((t) => t.day === day);
                    const fields = [...new Set([...cfg.fields, ...dayTeams.map((t) => t.field!)])].filter((f) =>
                      dayTeams.some((t) => t.field === f)
                    );
                    const slots = timeSlots(cfg).filter((s) => dayTeams.some((t) => t.time === s));
                    const cell = (time: string, field: string) => dayTeams.filter((t) => t.time === time && t.field === field);
                    return (
                      <div key={day} className="break-avoid">
                        <div className={`mb-2 inline-block rounded-full bg-gradient-to-r ${grad} px-3 py-0.5 text-sm font-bold text-white`}>
                          {day}
                        </div>
                        <div className="overflow-x-auto">
                          <div
                            className="grid min-w-max gap-px rounded-lg bg-gray-200 dark:bg-gray-700 p-px"
                            style={{ gridTemplateColumns: `5rem repeat(${fields.length}, minmax(130px, 1fr))` }}
                          >
                            <div className="bg-gray-50 dark:bg-gray-900" />
                            {fields.map((f) => (
                              <div key={f} className="bg-gray-50 dark:bg-gray-900 px-2 py-1.5 text-center text-xs font-semibold text-gray-700 dark:text-gray-200">
                                {f}
                              </div>
                            ))}
                            {slots.map((slot) => (
                              <Fragment key={slot}>
                                <div className="bg-gray-50 dark:bg-gray-900 px-2 py-2 text-right text-xs text-gray-500">{fmtTime(slot)}</div>
                                {fields.map((field) => (
                                  <div key={field} className="min-h-[36px] space-y-1 bg-white dark:bg-gray-950 p-1">
                                    {cell(slot, field).map((t) => (
                                      <div key={t.id} className="rounded border border-gray-200 dark:border-gray-700 px-1.5 py-0.5 text-xs">
                                        <div className="font-semibold text-gray-900 dark:text-gray-100">{t.name}</div>
                                        {t.coach && <div className="text-[10px] text-gray-500">{t.coach}</div>}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </Fragment>
                            ))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {unscheduled.length > 0 && (
                <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold">Not scheduled:</span> {unscheduled.map((t) => t.name).join(", ")}
                </p>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
