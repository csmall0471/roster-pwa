"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  addAssistantCoach,
  addCoachTeam,
  addTeam,
  emailRoster,
  exportRosterCsv,
  generateTeams,
  movePlayer,
  movePlayerToTeam,
  renameTeam,
  setTeamNight,
  updateGroupingConfig,
} from "../../actions";
import { type GroupConfig, type Weights, NIGHTS, flagsFor } from "../../group/engine";
import { normalize } from "../../resolve/similarity";
import PlayerDetail from "./PlayerDetail";
import BoardStats from "./BoardStats";

// Group key for a requested coach name. Normalizes punctuation/case, then glues
// consecutive single-letter initials so "T.J. Gennaro" and "TJ Gennaro" collapse
// to the same key ("tj gennaro") instead of showing as two separate coaches.
function coachGroupKey(text: string): string {
  return normalize(text)
    .replace(/^coach /, "")
    .replace(/\b(\p{L}) (?=\p{L}\b)/gu, "$1");
}

export type BoardPlayer = {
  id: string;
  name: string;
  divisionId: string;
  teamId: string | null;
  coachId: string | null; // the MATCHED roster coach (null if they asked for someone not on it)
  coachReq: boolean; // they asked for a coach at all (matched or not) — the honest denominator
  coachReqText: string; // what they typed (for unmatched requests: the coach not on the roster)
  teamNameId: string | null;
  nights: string[];
  buddyIds: string[]; // MATCHED buddies (resolved to a roster player)
  buddyReq: boolean; // they named a buddy at all (matched or not) — the honest denominator
  raw: Record<string, unknown> | null; // the original CSV row, for the detail view
};
export type BoardTeam = { id: string; divisionId: string; name: string; night: string | null; coachId: string | null; assistants: string[] };
export type PlayUpFlag = {
  playerId: string;
  name: string;
  currentDivision: string;
  enrolledAge: number | null;
  hintedAge: number;
  suggestedDivisionId: string | null;
  source: string; // the exact request text that triggered the flag
};

const WEIGHT_KEYS: (keyof Weights)[] = ["coach", "team", "buddy", "night"];
const WEIGHT_LABEL: Record<keyof Weights, string> = {
  coach: "Coach request",
  team: "Team-name request",
  buddy: "Buddy / family",
  night: "Practice night",
};
const SCALE = [8, 6, 3, 1]; // descending weights applied by rank when reordering

export default function TeamsBoard({
  seasonId,
  seasonName,
  config: initialConfig,
  divisions,
  teams: initialTeams,
  players,
  playUps,
  coachNames,
  teamNames,
}: {
  seasonId: string;
  seasonName: string;
  config: GroupConfig;
  divisions: { id: string; name: string }[];
  teams: BoardTeam[];
  players: BoardPlayer[];
  playUps: PlayUpFlag[];
  coachNames: Record<string, string>;
  teamNames: Record<string, string>;
}) {
  const router = useRouter();

  const [target, setTarget] = useState(initialConfig.target);
  // Criterion order (drag-to-reorder via the up/down buttons) → weights by rank.
  const [order, setOrder] = useState<(keyof Weights)[]>(
    [...WEIGHT_KEYS].sort((a, b) => initialConfig.weights[b] - initialConfig.weights[a])
  );
  const [weights, setWeights] = useState<Weights>(initialConfig.weights);

  const [divisionId, setDivisionId] = useState(divisions[0]?.id ?? "");
  const [teams, setTeams] = useState<BoardTeam[]>(initialTeams);
  const [assign, setAssign] = useState<Map<string, string | null>>(
    () => new Map(players.map((p) => [p.id, p.teamId]))
  );
  // Re-sync local state when the server sends new data (after generate /
  // add-team trigger router.refresh). useState initializers only run on mount,
  // so we reset during render when the props' signature changes — the
  // React-recommended alternative to a syncing effect.
  const dataSig =
    initialTeams.map((t) => `${t.id}:${t.name}:${t.night ?? ""}`).join("|") +
    "#" +
    players.map((p) => `${p.id}:${p.teamId ?? ""}`).join(",");
  const [sig, setSig] = useState(dataSig);
  if (sig !== dataSig) {
    setSig(dataSig);
    setTeams(initialTeams);
    setAssign(new Map(players.map((p) => [p.id, p.teamId])));
  }
  const [busy, setBusy] = useState(false);
  // Dedicated to the generate action so we can blank the board (below) only
  // while generating — not while saving settings (also `busy`).
  const [generating, setGenerating] = useState(false);
  // Per-player division move — kept separate from `busy` (settings/generate) so
  // moving one play-up player doesn't grey out every button or the Generate one.
  const [movingId, setMovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newTeamName, setNewTeamName] = useState("");

  // Export
  const [emailTo, setEmailTo] = useState("");
  const [emailing, setEmailing] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  async function downloadCsv() {
    setDownloading(true);
    try {
      const csv = await exportRosterCsv(seasonId);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "rosters.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  async function sendEmail() {
    setEmailMsg(null);
    setEmailing(true);
    try {
      const res = await emailRoster(seasonId, emailTo);
      setEmailMsg(res.ok ? "Sent!" : res.error ?? "Failed to send.");
    } finally {
      setEmailing(false);
    }
  }

  const config: GroupConfig = { target, weights };

  function reorder(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    // Re-derive weights from the new ranking.
    const w = { ...weights };
    next.forEach((k, idx) => (w[k] = SCALE[idx] ?? 1));
    setWeights(w);
  }

  async function saveSettings() {
    setBusy(true);
    setError(null);
    try {
      await updateGroupingConfig(seasonId, config);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!confirm("Generate teams for all divisions? This replaces any existing teams.")) return;
    setGenerating(true);
    setError(null);
    try {
      await generateTeams(seasonId, config);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate.");
    } finally {
      setGenerating(false);
    }
  }

  async function move(playerId: string, teamId: string | null) {
    const prev = assign.get(playerId) ?? null;
    if (prev === teamId) return;
    setAssign((m) => new Map(m).set(playerId, teamId)); // optimistic
    try {
      await movePlayerToTeam(seasonId, playerId, teamId);
    } catch {
      setAssign((m) => new Map(m).set(playerId, prev)); // revert
      setError("Failed to move player.");
    }
  }

  // Cross-division move changes which division a player belongs to, so we can't
  // patch local state cleanly — round-trip to the server and refresh. The player
  // lands Unassigned in the target division (movePlayer clears their team).
  async function moveDivision(playerId: string, newDivisionId: string) {
    setSelectedId(null);
    setMovingId(playerId);
    setError(null);
    try {
      await movePlayer(seasonId, playerId, newDivisionId);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to move player.");
    } finally {
      setMovingId(null);
    }
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [teamQuery, setTeamQuery] = useState("");
  const [openPlayUp, setOpenPlayUp] = useState<Set<string>>(new Set());

  const divName = useMemo(() => new Map(divisions.map((d) => [d.id, d.name])), [divisions]);
  const divisionTeams = teams.filter((t) => t.divisionId === divisionId);
  const divisionPlayers = useMemo(
    () => players.filter((p) => p.divisionId === divisionId),
    [players, divisionId]
  );
  const membersOf = (teamId: string | null) =>
    divisionPlayers.filter((p) => (assign.get(p.id) ?? null) === teamId);

  // Coaches requested in THIS division but not on its roster (so those kids are
  // free agents). Grouped by the requested name, 3+ families — the ones you'd
  // most want to cluster onto a team here, or add to the roster.
  const missingCoaches = useMemo(() => {
    const m = new Map<string, { name: string; players: string[]; playerIds: string[]; volunteer: boolean }>();
    for (const p of divisionPlayers) {
      if (!p.coachReq || p.coachId) continue; // matched, or no request
      const text = (p.coachReqText ?? "").trim();
      if (!text) continue;
      const key = coachGroupKey(text);
      if (!m.has(key)) m.set(key, { name: text, players: [], playerIds: [], volunteer: false });
      const e = m.get(key)!;
      e.players.push(p.name);
      e.playerIds.push(p.id);
      // Requested coach shares this kid's surname → a parent volunteering to coach.
      const last = p.name.trim().split(/\s+/).pop()?.toLowerCase() ?? "";
      if (last.length >= 3 && key.includes(last)) e.volunteer = true;
    }
    // Show coaches several families want, plus any parent volunteering (even just 1).
    return [...m.values()]
      .filter((x) => x.players.length >= 3 || x.volunteer)
      .sort((a, b) => Number(b.volunteer) - Number(a.volunteer) || b.players.length - a.players.length);
  }, [divisionPlayers]);

  // Adding a coach/assistant from the missing-coaches panel seats the requesting
  // kids onto the new/assisted team, then auto-regenerates so the board reflects
  // it immediately — no separate "Generate" click. `generating` blanks the board
  // while it runs, same as the manual button.
  async function addCoach(name: string, playerIds: string[]) {
    setGenerating(true);
    setError(null);
    try {
      await addCoachTeam(seasonId, divisionId, name, playerIds);
      await generateTeams(seasonId, config);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add coach.");
    } finally {
      setGenerating(false);
    }
  }

  async function addAssistant(teamId: string, name: string, playerIds: string[]) {
    setGenerating(true);
    setError(null);
    try {
      await addAssistantCoach(seasonId, teamId, name, playerIds);
      await generateTeams(seasonId, config);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add assistant.");
    } finally {
      setGenerating(false);
    }
  }

  // Dominant coach per team — used to flag players not on their requested coach.
  const teamCoach = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of divisionTeams) {
      // Authoritative coach from the uploaded roster wins; open placeholder teams
      // (no coach_id) fall back to the dominant member request.
      if (t.coachId) {
        map.set(t.id, t.coachId);
        continue;
      }
      const counts = new Map<string, number>();
      for (const p of membersOf(t.id)) if (p.coachId) counts.set(p.coachId, (counts.get(p.coachId) ?? 0) + 1);
      const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      map.set(t.id, top ? top[0] : null);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [divisionTeams, assign, divisionPlayers]);

  // Search/sort teams by team name or coach name; sort matched coaches/teams first.
  const q = teamQuery.trim().toLowerCase();
  const visibleTeams = (q
    ? divisionTeams.filter((t) => {
        const coach = teamCoach.get(t.id);
        return t.name.toLowerCase().includes(q) || (coach && (coachNames[coach] ?? "").toLowerCase().includes(q));
      })
    : divisionTeams
  )
    .slice()
    // Coached teams first (alphabetical), then uncoached "Team N" placeholders last.
    .sort(
      (a, b) =>
        (a.coachId ? 0 : 1) - (b.coachId ? 0 : 1) ||
        a.name.localeCompare(b.name, undefined, { numeric: true })
    );

  const selectedPlayer = selectedId ? divisionPlayers.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="space-y-6">
      {/* Season-wide stats, above the page header */}
      <BoardStats
        scope="season"
        title="Whole season"
        subtitle={`${divisions.length} divisions`}
        allPlayers={players}
        divisionPlayers={divisionPlayers}
        teams={teams}
        divisionTeams={divisionTeams}
        divisions={divisions}
        assign={assign}
        coachNames={coachNames}
        teamNames={teamNames}
      />

      {/* Page header */}
      <div>
        <Link
          href={`/tools/roster-creator/${seasonId}`}
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← {seasonName}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 dark:text-white">Teams</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
          Generate teams from the resolved requests, then drag players to fix anything. Flags mark
          unmet coach, buddy, and practice-night requests.
        </p>
      </div>

      {/* Players who may be in the wrong division — fix BEFORE generating */}
      {playUps.length > 0 && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Check division before generating ({playUps.length})
          </h2>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
            These players&rsquo; requests mention a different age group than they enrolled in. Move
            anyone who should play up/down — do this first, since teams are built per division.
          </p>
          <ul className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-gray-900 divide-y divide-amber-100 dark:divide-amber-900/30">
            {playUps.map((p) => {
              const open = openPlayUp.has(p.playerId);
              return (
                <li key={p.playerId} className="px-3 py-2 text-sm">
                  <div className="flex items-center gap-3">
                    <span className="text-gray-900 dark:text-white">{p.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenPlayUp((s) => {
                          const n = new Set(s);
                          if (n.has(p.playerId)) n.delete(p.playerId);
                          else n.add(p.playerId);
                          return n;
                        })
                      }
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline decoration-dotted"
                    >
                      {p.currentDivision} · request mentions U{p.hintedAge}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {p.suggestedDivisionId && divName.get(p.suggestedDivisionId) && (
                        <button
                          type="button"
                          disabled={movingId === p.playerId}
                          onClick={() => moveDivision(p.playerId, p.suggestedDivisionId!)}
                          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                        >
                          {movingId === p.playerId ? "Moving…" : `Move up to ${divName.get(p.suggestedDivisionId)}`}
                        </button>
                      )}
                      <select
                        value=""
                        disabled={movingId === p.playerId}
                        onChange={(e) => e.target.value && moveDivision(p.playerId, e.target.value)}
                        className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs text-gray-900 dark:text-gray-100 disabled:opacity-50"
                      >
                        <option value="">Other division…</option>
                        {divisions
                          .filter((d) => d.id !== p.suggestedDivisionId)
                          .map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                      </select>
                    </div>
                  </div>
                  {open && (
                    <p className="mt-1 ml-0 text-xs italic text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 rounded border border-amber-100 dark:border-amber-900/30 px-2 py-1">
                      “{p.source || "(no request text)"}”
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Settings + generate */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Target team size</span>
            <input type="number" min={1} value={target} onChange={(e) => setTarget(+e.target.value)}
              className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm" />
            <span className="text-[11px] text-gray-400">over only for coaches</span>
          </label>

          <div className="w-full max-w-xl">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Priority (top = most important)</span>
            <ol className="mt-1 space-y-1">
              {order.map((k, i) => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-400 w-4 text-right">{i + 1}.</span>
                  <span className="flex-1 text-gray-800 dark:text-gray-200">{WEIGHT_LABEL[k]}</span>
                  <input type="number" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: +e.target.value })}
                    className="w-16 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1 text-xs" />
                  <button type="button" onClick={() => reorder(i, -1)} disabled={i === 0}
                    className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↑</button>
                  <button type="button" onClick={() => reorder(i, 1)} disabled={i === order.length - 1}
                    className="px-1.5 text-gray-500 hover:text-gray-800 disabled:opacity-30">↓</button>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button type="button" onClick={generate} disabled={busy || generating}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
            {generating && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />}
            {generating ? "Generating…" : "Generate teams"}
          </button>
          <button type="button" onClick={saveSettings} disabled={busy || generating}
            className="text-sm font-semibold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            Save settings
          </button>
          {error && <span className="text-sm text-red-600 dark:text-red-400">{error}</span>}
        </div>
      </section>

      {generating ? (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-10 text-center">
          <div className="inline-flex items-center gap-3 text-sm font-medium text-gray-700 dark:text-gray-200">
            <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            Generating teams…
          </div>
        </div>
      ) : (
       <>
      {/* Division selector + team search + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="font-medium text-gray-600 dark:text-gray-300">Division</span>
            <select value={divisionId} onChange={(e) => setDivisionId(e.target.value)}
              className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm">
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </label>
          <input
            value={teamQuery}
            onChange={(e) => setTeamQuery(e.target.value)}
            placeholder="Search teams or coaches…"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm w-56"
          />
          <span className="text-xs text-gray-400">{visibleTeams.length} teams</span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span><Dot color="bg-red-500" /> coach</span>
          <span><Dot color="bg-amber-500" /> buddy</span>
          <span><Dot color="bg-blue-500" /> practice night</span>
          <span className="text-gray-400">· click a player to move/explain</span>
        </div>
      </div>

      {/* Live stats for the selected division (updates as you move players) */}
      <BoardStats
        scope="division"
        title={divName.get(divisionId) ?? ""}
        subtitle="this division"
        allPlayers={players}
        divisionPlayers={divisionPlayers}
        teams={teams}
        divisionTeams={divisionTeams}
        divisions={divisions}
        assign={assign}
        coachNames={coachNames}
        teamNames={teamNames}
      />

      {/* Requested coaches not on this division's roster — actionable here */}
      {missingCoaches.length > 0 && (
        <section className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 p-4">
          <h2 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            Requested coaches not on this division&rsquo;s roster ({missingCoaches.length})
          </h2>
          <p className="text-xs text-gray-600 dark:text-gray-300 mb-2">
            Asked for in {divName.get(divisionId) ?? "this division"} but not on its roster (3+ families, plus any
            parent volunteering). Give them a <strong>New team</strong>, or add as an <strong>Assistant</strong> on
            an existing team — the requesting kids are seated and the board re-generates automatically.
          </p>
          <ul className="rounded-lg border border-amber-200 dark:border-amber-900/40 bg-white dark:bg-gray-900 divide-y divide-amber-100 dark:divide-amber-900/30 max-h-56 overflow-y-auto">
            {missingCoaches.map((m, i) => (
              <li key={i} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900 dark:text-white">{m.name}</span>
                  {m.volunteer && (
                    <span className="ml-2 rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                      parent volunteering
                    </span>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 truncate">{m.players.join(", ")}</p>
                </span>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="tabular-nums text-xs font-semibold text-amber-700 dark:text-amber-300">
                    {m.players.length}
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => addCoach(m.name, m.playerIds)}
                    className="rounded-md bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                    title="Create a new team for this coach and seat their families"
                  >
                    + New team
                  </button>
                  <select
                    value=""
                    disabled={busy}
                    onChange={(e) => e.target.value && addAssistant(e.target.value, m.name, m.playerIds)}
                    title="Add this coach as an assistant on an existing team"
                    className="rounded-md border border-amber-300 dark:border-amber-800 bg-white dark:bg-gray-950 px-1.5 py-1 text-xs text-gray-700 dark:text-gray-200 disabled:opacity-50"
                  >
                    <option value="">Assistant to…</option>
                    {divisionTeams
                      .filter((t) => t.coachId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4">
        {visibleTeams.map((t) => {
          const members = membersOf(t.id);
          const coach = teamCoach.get(t.id);
          const sizeColor = members.length > target ? "text-amber-600" : "text-gray-500 dark:text-gray-400";
          return (
            <Column key={t.id} onDropPlayer={(pid) => move(pid, t.id)}>
              <div className="flex items-center justify-between gap-2">
                <input defaultValue={t.name} onBlur={(e) => { renameTeam(seasonId, t.id, e.target.value); }}
                  className="font-semibold text-sm bg-transparent text-gray-900 dark:text-white w-full focus:outline-none focus:border-b border-gray-300" />
                <span className={`text-xs font-semibold ${sizeColor}`} title={`target ${target}`}>{members.length}/{target}</span>
              </div>
              <p className="text-[11px] text-gray-400 mb-1 truncate">
                {coach ? coachNames[coach] ?? "" : "no coach"}
                {t.assistants.length > 0 && <span> + {t.assistants.join(", ")}</span>}
              </p>
              <select value={t.night ?? ""} onChange={(e) => {
                  const v = e.target.value || null;
                  setTeams((ts) => ts.map((x) => (x.id === t.id ? { ...x, night: v } : x)));
                  setTeamNight(seasonId, t.id, v);
                }}
                className="w-full mb-2 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-950 px-2 py-1 text-xs text-gray-600 dark:text-gray-300">
                <option value="">No practice night</option>
                {NIGHTS.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              {(() => {
                // Requesters (asked for this coach/team) on top; everyone else below.
                const isRequester = (p: BoardPlayer) =>
                  (p.coachId && p.coachId === coach) || (p.teamNameId && teamNames[p.teamNameId] === t.name);
                const requesters = members.filter(isRequester);
                const others = members.filter((p) => !isRequester(p));
                const card = (p: BoardPlayer) => (
                  <PlayerCard key={p.id} player={p} onSelect={() => setSelectedId(p.id)} flags={flagsFor(
                    { id: p.id, coachId: p.coachId, coachReq: p.coachReq, teamNameId: p.teamNameId, nights: p.nights, buddyIds: p.buddyIds },
                    { coachId: teamCoach.get(t.id) ?? null, playerIds: members.map((m) => m.id), night: t.night }
                  )} />
                );
                return (
                  <div className="space-y-1">
                    {requesters.length > 0 && (
                      <p className="text-[10px] uppercase tracking-wide text-gray-300 dark:text-gray-600">requested</p>
                    )}
                    {requesters.map(card)}
                    {requesters.length > 0 && others.length > 0 && (
                      <p className="text-[10px] uppercase tracking-wide text-gray-300 dark:text-gray-600 pt-1">added to fill</p>
                    )}
                    {others.map(card)}
                  </div>
                );
              })()}
            </Column>
          );
        })}

        {/* Unassigned */}
        <Column onDropPlayer={(pid) => move(pid, null)} muted>
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm text-gray-500 dark:text-gray-400">Unassigned</span>
            <span className="text-xs text-gray-400">{membersOf(null).length}</span>
          </div>
          <div className="space-y-1">
            {membersOf(null).map((p) => (
              <PlayerCard key={p.id} player={p} onSelect={() => setSelectedId(p.id)} flags={{ coachUnmet: false, buddyUnmet: false, nightUnmet: false }} />
            ))}
          </div>
        </Column>
      </div>
       </>
      )}

      {selectedPlayer && (
        <PlayerDetail
          player={selectedPlayer}
          divisionTeams={divisionTeams}
          allTeams={teams}
          divisions={divisions}
          allPlayers={players}
          assign={assign}
          teamCoach={teamCoach}
          coachNames={coachNames}
          teamNames={teamNames}
          onMove={move}
          onMoveDivision={moveDivision}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Add a team to this division */}
      <div className="flex items-end gap-2">
        <input value={newTeamName} onChange={(e) => setNewTeamName(e.target.value)} placeholder="New team name"
          className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm w-56" />
        <button type="button" disabled={!newTeamName.trim()} onClick={async () => {
            await addTeam(seasonId, divisionId, newTeamName);
            setNewTeamName("");
            router.refresh();
          }}
          className="inline-flex items-center rounded-lg bg-gray-200 dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-300 disabled:opacity-50">
          Add team
        </button>
      </div>

      {/* Export */}
      <section className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
          Export rosters
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={downloadCsv} disabled={downloading}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-60">
            {downloading && <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />}
            {downloading ? "Preparing…" : "Download CSV"}
          </button>
          <Link href={`/tools/roster-creator/${seasonId}/teams/print`} target="_blank"
            className="inline-flex items-center rounded-lg border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
            Print / PDF
          </Link>
          <span className="mx-1 h-5 w-px bg-gray-200 dark:bg-gray-700" />
          <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="email@example.com"
            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm w-56" />
          <button type="button" onClick={sendEmail} disabled={emailing || !emailTo.trim()}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {emailing ? "Sending…" : "Email CSV"}
          </button>
          {emailMsg && (
            <span className={`text-sm ${emailMsg === "Sent!" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
              {emailMsg}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

function Column({ children, onDropPlayer, muted }: { children: React.ReactNode; onDropPlayer: (playerId: string) => void; muted?: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const id = e.dataTransfer.getData("text/plain"); if (id) onDropPlayer(id); }}
      className={`shrink-0 w-56 rounded-lg border p-2 ${over ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30" : muted ? "border-dashed border-gray-300 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40" : "border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900"}`}
    >
      {children}
    </div>
  );
}

function PlayerCard({
  player,
  flags,
  onSelect,
}: {
  player: BoardPlayer;
  flags: { coachUnmet: boolean; buddyUnmet: boolean; nightUnmet: boolean };
  onSelect: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", player.id)}
      onClick={onSelect}
      title="Click to move / explain"
      className="flex items-center gap-2 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm cursor-pointer hover:border-blue-400 active:cursor-grabbing"
    >
      <span className="flex-1 truncate text-gray-800 dark:text-gray-200">{player.name}</span>
      {flags.coachUnmet && <Dot color="bg-red-500" title="Coach request unmet" />}
      {flags.buddyUnmet && <Dot color="bg-amber-500" title="No requested buddy on this team" />}
      {flags.nightUnmet && <Dot color="bg-blue-500" title="Not free on team's practice night" />}
    </div>
  );
}

function Dot({ color, title }: { color: string; title?: string }) {
  return <span title={title} className={`inline-block w-2 h-2 rounded-full ${color}`} />;
}
