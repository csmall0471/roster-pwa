"use client";

import { useMemo, useState } from "react";
import type { BoardPlayer, BoardTeam } from "./TeamsBoard";

// Dominant coach per team = the coach the most of its members requested.
function dominantCoaches(players: BoardPlayer[], assign: Map<string, string | null>) {
  const votes = new Map<string, Map<string, number>>();
  for (const p of players) {
    const tid = assign.get(p.id) ?? null;
    if (!tid || !p.coachId) continue;
    if (!votes.has(tid)) votes.set(tid, new Map());
    const m = votes.get(tid)!;
    m.set(p.coachId, (m.get(p.coachId) ?? 0) + 1);
  }
  const out = new Map<string, string>();
  for (const [tid, m] of votes) {
    let best = "";
    let n = -1;
    for (const [c, v] of m) if (v > n) { n = v; best = c; }
    out.set(tid, best);
  }
  return out;
}

type Sat = { coach: [number, number]; team: [number, number]; buddy: [number, number]; night: [number, number] };

function satisfaction(
  players: BoardPlayer[],
  assign: Map<string, string | null>,
  teamById: Map<string, BoardTeam>,
  teamCoach: Map<string, string>,
  teamNames: Record<string, string>
): Sat {
  const s: Sat = { coach: [0, 0], team: [0, 0], buddy: [0, 0], night: [0, 0] };
  for (const p of players) {
    const tid = assign.get(p.id) ?? null;
    const team = tid ? teamById.get(tid) ?? null : null;
    if (p.coachId) {
      s.coach[1]++;
      if (team && teamCoach.get(tid!) === p.coachId) s.coach[0]++;
    }
    if (p.teamNameId) {
      s.team[1]++;
      if (team && team.name === teamNames[p.teamNameId]) s.team[0]++;
    }
    if (p.buddyIds.length) {
      s.buddy[1]++;
      if (tid && p.buddyIds.some((b) => (assign.get(b) ?? null) === tid)) s.buddy[0]++;
    }
    if (p.nights.length && team?.night) {
      s.night[1]++;
      if (p.nights.includes(team.night)) s.night[0]++;
    }
  }
  return s;
}

type TopRow = { label: string; count: number; tags?: string[] };

// Top-k by frequency. When `divName` is given, attach the (short) age-group
// tags for every division the coach/team appears in — so a coach who runs teams
// in multiple age groups shows all of them.
function topCounts(
  players: BoardPlayer[],
  key: (p: BoardPlayer) => string | null,
  label: (id: string) => string,
  divName?: Map<string, string>,
  k = 3
): TopRow[] {
  const m = new Map<string, { count: number; divs: Set<string> }>();
  for (const p of players) {
    const id = key(p);
    if (!id) continue;
    if (!m.has(id)) m.set(id, { count: 0, divs: new Set() });
    const e = m.get(id)!;
    e.count++;
    e.divs.add(p.divisionId);
  }
  return [...m.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, k)
    .map(([id, e]) => ({
      label: label(id),
      count: e.count,
      tags: divName
        ? [...e.divs].map((d) => (divName.get(d) ?? "").replace(/^Peoria\s+/i, "")).filter(Boolean).sort()
        : undefined,
    }));
}

type Block = {
  hasTeams: boolean;
  sat: Sat | null;
  vol: { players: number; coach: number; team: number; buddy: number; night: number };
  topCoaches: TopRow[];
  topTeams: TopRow[];
  topBuddies: TopRow[];
};

function computeBlock(
  players: BoardPlayer[],
  teamsList: BoardTeam[],
  assign: Map<string, string | null>,
  coachNames: Record<string, string>,
  teamNames: Record<string, string>,
  divName: Map<string, string> | undefined // set ⇒ attach age-group tags (season view)
): Block {
  const teamById = new Map(teamsList.map((t) => [t.id, t]));
  const dom = dominantCoaches(players, assign);
  // A team's coach is authoritative (tb_teams.coach_id) when set; open
  // placeholder teams fall back to the dominant member request.
  const teamCoach = new Map<string, string>();
  for (const t of teamsList) {
    const c = t.coachId ?? dom.get(t.id) ?? "";
    if (c) teamCoach.set(t.id, c);
  }
  // "Has teams" means players have actually been ASSIGNED. tb_teams now exists
  // from the coach-file setup (before you build), so gate satisfaction on real
  // assignments — otherwise it reads a misleading 0% before any team is built.
  const hasTeams = players.some((p) => (assign.get(p.id) ?? null) != null);
  const nameById = new Map(players.map((p) => [p.id, p.name]));
  // Most-requested teammates: count incoming buddy mentions.
  const buddyCount = new Map<string, number>();
  for (const p of players) for (const b of p.buddyIds) if (nameById.has(b)) buddyCount.set(b, (buddyCount.get(b) ?? 0) + 1);
  const topBuddies: TopRow[] = [...buddyCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, n]) => ({ label: nameById.get(id) ?? "—", count: n }));
  return {
    hasTeams,
    sat: hasTeams ? satisfaction(players, assign, teamById, teamCoach, teamNames) : null,
    vol: {
      players: players.length,
      coach: players.filter((p) => p.coachId).length,
      team: players.filter((p) => p.teamNameId).length,
      buddy: players.filter((p) => p.buddyIds.length).length,
      night: players.filter((p) => p.nights.length).length,
    },
    topCoaches: topCounts(players, (p) => p.coachId, (id) => coachNames[id] ?? "—", divName),
    topTeams: topCounts(players, (p) => p.teamNameId, (id) => teamNames[id] ?? "—", divName),
    topBuddies,
  };
}

function pct(met: number, req: number) {
  return req === 0 ? "—" : `${Math.round((100 * met) / req)}%`;
}

function StatRow({ label, met, req, color }: { label: string; met: number; req: number; color: string }) {
  const w = req === 0 ? 0 : Math.round((100 * met) / req);
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 text-gray-500 dark:text-gray-400">{label}</span>
      <div className="flex-1 min-w-0 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-gray-700 dark:text-gray-200">
        {pct(met, req)} <span className="text-gray-400">({met}/{req})</span>
      </span>
    </div>
  );
}

function TopChart({ title, rows }: { title: string; rows: TopRow[] }) {
  const max = rows[0]?.count ?? 1;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{title}</p>
      {rows.length === 0 ? (
        <p className="text-xs text-gray-400">none</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="text-xs">
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate text-gray-700 dark:text-gray-200" title={r.label}>{r.label}</span>
                <div className="w-24 h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                  <div className="h-full bg-blue-400" style={{ width: `${Math.round((100 * r.count) / max)}%` }} />
                </div>
                <span className="w-6 text-right tabular-nums text-gray-500">{r.count}</span>
              </div>
              {r.tags && r.tags.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className="rounded-full bg-gray-100 dark:bg-gray-800 px-1.5 py-px text-[10px] font-medium text-gray-500 dark:text-gray-400"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardStats({
  scope,
  title,
  subtitle,
  allPlayers,
  divisionPlayers,
  teams,
  divisionTeams,
  divisions,
  assign,
  coachNames,
  teamNames,
}: {
  scope: "season" | "division";
  title: string;
  subtitle?: string;
  allPlayers: BoardPlayer[];
  divisionPlayers: BoardPlayer[];
  teams: BoardTeam[];
  divisionTeams: BoardTeam[];
  divisions: { id: string; name: string }[];
  assign: Map<string, string | null>;
  coachNames: Record<string, string>;
  teamNames: Record<string, string>;
}) {
  const [open, setOpen] = useState(true);
  const divName = useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);

  const block = useMemo(
    () =>
      scope === "season"
        ? computeBlock(allPlayers, teams, assign, coachNames, teamNames, divName)
        : computeBlock(divisionPlayers, divisionTeams, assign, coachNames, teamNames, undefined),
    [scope, allPlayers, divisionPlayers, teams, divisionTeams, assign, coachNames, teamNames, divName]
  );

  const v = block.vol;

  return (
    <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3">
        <span className="text-sm font-semibold text-gray-900 dark:text-white">
          {scope === "season" ? "Season stats" : "Division stats"}
        </span>
        <span className="flex items-center gap-3 text-xs text-gray-500">
          {block.sat && (
            <span className="hidden sm:inline">
              coach {pct(block.sat.coach[0], block.sat.coach[1])} · buddy {pct(block.sat.buddy[0], block.sat.buddy[1])} ·
              practice night {pct(block.sat.night[0], block.sat.night[1])}
            </span>
          )}
          <span>{open ? "−" : "+"}</span>
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-200">
                {title}
                {subtitle && <span className="ml-1 font-normal text-gray-400">{subtitle}</span>}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {v.players} players · {v.coach} coach · {v.buddy} buddy · {v.night} practice-night requests
              </p>
            </div>
            {block.sat ? (
              <div className="space-y-1.5">
                <StatRow label="Coach" met={block.sat.coach[0]} req={block.sat.coach[1]} color="bg-red-400" />
                <StatRow label="Buddy" met={block.sat.buddy[0]} req={block.sat.buddy[1]} color="bg-amber-400" />
                <StatRow label="Practice night" met={block.sat.night[0]} req={block.sat.night[1]} color="bg-blue-400" />
              </div>
            ) : (
              <p className="text-xs text-gray-400 italic">Generate teams to see how many requests are met.</p>
            )}
          </div>
          <TopChart title="Top requested coaches" rows={block.topCoaches} />
          <TopChart title="Most-requested teammates" rows={block.topBuddies} />
        </div>
      )}
    </section>
  );
}
