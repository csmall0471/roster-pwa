import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchRosterRows } from "../../../roster-data";
import type { RosterRow } from "../../../export-csv";
import PrintButton from "./PrintButton";

// Static (Tailwind-safe) color sets cycled per division so each gets its own
// identity on the printed sheet.
const PALETTE = [
  { grad: "from-blue-500 to-indigo-600", bar: "bg-blue-600", ring: "border-blue-200", chip: "bg-blue-100 text-blue-800" },
  { grad: "from-emerald-500 to-teal-600", bar: "bg-emerald-600", ring: "border-emerald-200", chip: "bg-emerald-100 text-emerald-800" },
  { grad: "from-violet-500 to-purple-600", bar: "bg-violet-600", ring: "border-violet-200", chip: "bg-violet-100 text-violet-800" },
  { grad: "from-amber-500 to-orange-600", bar: "bg-amber-600", ring: "border-amber-200", chip: "bg-amber-100 text-amber-800" },
  { grad: "from-rose-500 to-pink-600", bar: "bg-rose-600", ring: "border-rose-200", chip: "bg-rose-100 text-rose-800" },
  { grad: "from-cyan-500 to-sky-600", bar: "bg-cyan-600", ring: "border-cyan-200", chip: "bg-cyan-100 text-cyan-800" },
];

const COACH_KID = "⭐";

type Tally = { coach: [number, number]; team: [number, number]; buddy: [number, number]; night: [number, number] };

function tally(rows: RosterRow[]): Tally {
  const t: Tally = { coach: [0, 0], team: [0, 0], buddy: [0, 0], night: [0, 0] };
  const add = (slot: [number, number], v: string) => {
    if (v === "Yes" || v === "No") slot[1]++;
    if (v === "Yes") slot[0]++;
  };
  for (const r of rows) {
    add(t.coach, r.coachMet);
    add(t.team, r.teamMet);
    add(t.buddy, r.buddiesMet);
    add(t.night, r.nightMet);
  }
  return t;
}

const pct = ([met, req]: [number, number]) => (req === 0 ? "—" : `${Math.round((100 * met) / req)}%`);

export default async function PrintRostersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: season } = await supabase.from("tb_seasons").select("name, sport").eq("id", id).maybeSingle();
  if (!season) notFound();

  const rows = await fetchRosterRows(supabase, id);

  // Group division → team → players (rows are pre-sorted). Capture each team's
  // coach (the assigned/dominant coach materialized into the export).
  type TeamGroup = { team: string; night: string; time: string; field: string; coach: string; players: RosterRow[] };
  const divisions: { division: string; teams: TeamGroup[]; rows: RosterRow[] }[] = [];
  for (const r of rows) {
    let div = divisions.find((d) => d.division === r.division);
    if (!div) {
      div = { division: r.division, teams: [], rows: [] };
      divisions.push(div);
    }
    div.rows.push(r);
    let team = div.teams.find((t) => t.team === r.team);
    if (!team) {
      team = { team: r.team, night: r.night, time: r.time, field: r.field, coach: "", players: [] };
      div.teams.push(team);
    }
    if (!team.coach && r.coachAssigned) team.coach = r.coachAssigned;
    team.players.push(r);
  }

  const totalTeams = divisions.reduce((n, d) => n + d.teams.length, 0);
  const overall = tally(rows);

  return (
    <div className="max-w-4xl mx-auto print:max-w-none">
      {/* Keep background colors when printing; hide app chrome. */}
      <style>{`
        @media print {
          header { display: none !important; }
          main { padding: 0 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .break-avoid { break-inside: avoid; }
        }
      `}</style>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 px-8 py-7 text-white shadow-lg break-avoid">
        <div className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-6 h-40 w-40 rounded-full bg-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/70">Team Rosters</p>
            <h1 className="mt-1 text-4xl font-black tracking-tight">{season.name}</h1>
            {season.sport && <p className="mt-1 text-lg font-medium text-white/80">{season.sport}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              <Stat label="Players" value={rows.length} />
              <Stat label="Teams" value={totalTeams} />
              <Stat label="Divisions" value={divisions.length} />
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-white/85">
              <span>Coach <b className="font-bold text-white">{pct(overall.coach)}</b></span>
              <span>Team <b className="font-bold text-white">{pct(overall.team)}</b></span>
              <span>Buddy <b className="font-bold text-white">{pct(overall.buddy)}</b></span>
              <span>Practice night <b className="font-bold text-white">{pct(overall.night)}</b></span>
              <span className="text-white/70">requests met</span>
            </div>
          </div>
          <div className="print:hidden">
            <PrintButton />
          </div>
        </div>
        <p className="relative mt-4 text-xs text-white/70">{COACH_KID} = coach&rsquo;s own child</p>
      </div>

      <div className="mt-8 space-y-10">
        {divisions.map((div, di) => {
          const c = PALETTE[di % PALETTE.length];
          const s = tally(div.rows);
          return (
            <section key={div.division} className="break-avoid">
              <div className="mb-1 flex items-center gap-3">
                <span className={`inline-block h-7 w-1.5 rounded-full ${c.bar}`} />
                <h2 className="text-xl font-extrabold text-gray-900 dark:text-white">{div.division}</h2>
                <span className="text-sm text-gray-400">
                  {div.teams.length} teams · {div.rows.length} players
                </span>
              </div>
              <div className="mb-4 ml-[18px] flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                <span>Coach <b className={c.bar.replace("bg-", "text-")}>{pct(s.coach)}</b> <span className="text-gray-400">({s.coach[0]}/{s.coach[1]})</span></span>
                <span>Team <b className="text-gray-700 dark:text-gray-200">{pct(s.team)}</b> <span className="text-gray-400">({s.team[0]}/{s.team[1]})</span></span>
                <span>Buddy <b className="text-gray-700 dark:text-gray-200">{pct(s.buddy)}</b> <span className="text-gray-400">({s.buddy[0]}/{s.buddy[1]})</span></span>
                <span>Practice night <b className="text-gray-700 dark:text-gray-200">{pct(s.night)}</b> <span className="text-gray-400">({s.night[0]}/{s.night[1]})</span></span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {div.teams.map((t) => {
                  const requesters = t.players.filter((p) => p.role === "Requester");
                  const filled = t.players.filter((p) => p.role !== "Requester");
                  return (
                    <div
                      key={t.team}
                      className={`break-avoid overflow-hidden rounded-2xl border ${c.ring} dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm`}
                    >
                      {/* Colored team header */}
                      <div className={`bg-gradient-to-r ${c.grad} px-4 py-3 text-white`}>
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-lg font-bold leading-tight">{t.team}</h3>
                          <span className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-xs font-bold">
                            {t.players.length}
                          </span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                          {t.coach && (
                            <span className="rounded-full bg-white/20 px-2 py-0.5 font-semibold">📋 {t.coach}</span>
                          )}
                          {(t.night || t.time) && (
                            <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium">
                              📅 {[t.night, t.time].filter(Boolean).join(" ")}
                            </span>
                          )}
                          {t.field && (
                            <span className="rounded-full bg-white/20 px-2 py-0.5 font-medium">📍 {t.field}</span>
                          )}
                        </div>
                      </div>
                      {/* Players: requesters first, then fill-ins */}
                      <ol className="divide-y divide-gray-100 dark:divide-gray-800">
                        {requesters.map((p, i) => (
                          <PlayerLi key={`r${i}`} p={p} n={i + 1} chip={c.chip} />
                        ))}
                        {requesters.length > 0 && filled.length > 0 && (
                          <li className="bg-gray-50 dark:bg-gray-800/50 px-4 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                            Added to fill
                          </li>
                        )}
                        {filled.map((p, i) => (
                          <PlayerLi key={`f${i}`} p={p} n={requesters.length + i + 1} chip={c.chip} muted />
                        ))}
                      </ol>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-10 text-center text-xs text-gray-400 print:mt-6">
        {season.name}{season.sport ? ` · ${season.sport}` : ""} — generated by Roster Creator
      </p>
    </div>
  );
}

function PlayerLi({ p, n, chip, muted }: { p: RosterRow; n: number; chip: string; muted?: boolean }) {
  return (
    <li className="flex items-center gap-3 px-4 py-1.5">
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${muted ? "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400" : chip}`}>
        {n}
      </span>
      <span className="flex-1 text-sm font-medium text-gray-900 dark:text-gray-100">
        {p.first} {p.last}
        {p.coachChild === "Yes" && <span title="Coach's child"> {COACH_KID}</span>}
      </span>
      {p.age && <span className="text-xs text-gray-400">{p.age}</span>}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/15 px-3 py-1.5 backdrop-blur-sm">
      <span className="text-xl font-black">{value}</span>
      <span className="ml-1.5 text-xs font-medium uppercase tracking-wide text-white/70">{label}</span>
    </div>
  );
}
