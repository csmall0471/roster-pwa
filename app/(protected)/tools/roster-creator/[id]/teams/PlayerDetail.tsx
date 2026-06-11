"use client";

import { useState } from "react";
import type { BoardPlayer, BoardTeam } from "./TeamsBoard";

type Ev = { coach?: boolean; team?: boolean; buddy?: boolean; night?: boolean };
type Suggestion = { teamId: string; label: string; tradeoffs: string[] };
// "na" = a request that can't be met by moving within this division (buddy in
// another division, or not on any roster).
type Line = {
  key: string;
  label: string;
  status: "met" | "unmet" | "na";
  explanation: string;
  suggestion?: Suggestion;
};

export default function PlayerDetail({
  player,
  divisionTeams,
  divisions,
  allPlayers,
  assign,
  teamCoach,
  coachNames,
  teamNames,
  onMove,
  onMoveDivision,
  onClose,
}: {
  player: BoardPlayer;
  divisionTeams: BoardTeam[];
  divisions: { id: string; name: string }[];
  allPlayers: BoardPlayer[];
  assign: Map<string, string | null>;
  teamCoach: Map<string, string | null>;
  coachNames: Record<string, string>;
  teamNames: Record<string, string>;
  onMove: (playerId: string, teamId: string | null) => void;
  onMoveDivision: (playerId: string, divisionId: string) => void;
  onClose: () => void;
}) {
  const allById = new Map(allPlayers.map((p) => [p.id, p])); // every division — to resolve cross-division buddies
  const divName = new Map(divisions.map((d) => [d.id, d.name]));
  const teamById = new Map(divisionTeams.map((t) => [t.id, t]));
  const teamName = (id: string | null) => (id ? teamById.get(id)?.name ?? "—" : "Unassigned");
  const nightOf = (id: string | null) => (id ? teamById.get(id)?.night ?? null : null);
  const domCoach = (id: string | null) => (id ? teamCoach.get(id) ?? null : null);
  const coachLabel = (id: string | null) => (id ? coachNames[id] ?? "a coach" : "—");

  const curTeam = assign.get(player.id) ?? null;

  const ev = (teamId: string | null): Ev => ({
    coach: player.coachId ? domCoach(teamId) === player.coachId : undefined,
    team: player.teamNameId ? (teamId ? teamById.get(teamId)?.name === teamNames[player.teamNameId] : false) : undefined,
    buddy: player.buddyIds.length ? player.buddyIds.some((id) => (assign.get(id) ?? null) === teamId) : undefined,
    night: nightOf(teamId) ? player.nights.includes(nightOf(teamId)!) : undefined,
  });
  const cur = ev(curTeam);

  const tradeoffs = (targetId: string): string[] => {
    const hyp = ev(targetId);
    const out: string[] = [];
    if (cur.coach === true && hyp.coach === false) out.push(`leaves coach ${coachLabel(player.coachId)}`);
    if (cur.team === true && hyp.team === false && player.teamNameId) out.push(`leaves team ${teamNames[player.teamNameId]}`);
    if (cur.buddy === true && hyp.buddy === false) out.push("separates from a buddy who's on this team");
    if (cur.night === true && hyp.night === false) out.push("won't make the new team's practice night");
    return out;
  };

  const lines: Line[] = [];

  if (player.coachId) {
    const met = cur.coach === true;
    let suggestion: Suggestion | undefined;
    if (!met) {
      const t = divisionTeams.find((x) => domCoach(x.id) === player.coachId);
      if (t && t.id !== curTeam) suggestion = { teamId: t.id, label: t.name, tradeoffs: tradeoffs(t.id) };
    }
    lines.push({
      key: "coach",
      label: `Coach — ${coachLabel(player.coachId)}`,
      status: met ? "met" : "unmet",
      explanation: met
        ? `On ${coachLabel(player.coachId)}'s team.`
        : `Currently on ${teamName(curTeam)} (coach ${coachLabel(domCoach(curTeam))}).` +
          (suggestion ? "" : ` No team in this division is run by ${coachLabel(player.coachId)}.`),
      suggestion,
    });
  }

  if (player.teamNameId) {
    const reqTeam = teamNames[player.teamNameId];
    const met = cur.team === true;
    let suggestion: Suggestion | undefined;
    if (!met) {
      const t = divisionTeams.find((x) => x.name === reqTeam);
      if (t && t.id !== curTeam) suggestion = { teamId: t.id, label: t.name, tradeoffs: tradeoffs(t.id) };
    }
    lines.push({
      key: "team",
      label: `Team — ${reqTeam}`,
      status: met ? "met" : "unmet",
      explanation: met ? `On ${reqTeam}.` : `Currently on ${teamName(curTeam)}.`,
      suggestion,
    });
  }

  // Raw teammate/family request text from the signup (covers the "no match"
  // case where there's no buddy link at all).
  const rawBuddyText = (() => {
    const raw = (player.raw ?? {}) as Record<string, unknown>;
    const keys = Object.keys(raw);
    const find = (re: RegExp) => {
      const k = keys.find((key) => re.test(key));
      return k ? String(raw[k] ?? "").trim() : "";
    };
    const f = find(/(teammate|family|buddy).*first/i);
    const l = find(/(teammate|family|buddy).*last/i);
    return `${f} ${l}`.trim();
  })();
  const isNoReq = (s: string) => !s || ["none", "no", "n/a", "na", "null", "nan"].includes(s.toLowerCase());
  const requestedBuddy = !isNoReq(rawBuddyText);

  const matched = player.buddyIds.map((id) => allById.get(id)).filter((p): p is BoardPlayer => !!p);

  if (matched.length || requestedBuddy) {
    const sameDiv = matched.filter((b) => b.divisionId === player.divisionId);
    const crossDiv = matched.filter((b) => b.divisionId !== player.divisionId);
    const onTeam = sameDiv.filter((b) => (assign.get(b.id) ?? null) === curTeam);
    const namesLabel = matched.length ? matched.map((b) => b.name).join(", ") : rawBuddyText;

    let status: Line["status"];
    let explanation: string;
    let suggestion: Suggestion | undefined;

    if (onTeam.length > 0) {
      status = "met";
      explanation = `With ${onTeam.map((b) => b.name).join(", ")}.`;
    } else if (sameDiv.length > 0) {
      // A buddy is in this division on another team — fixable by moving.
      status = "unmet";
      explanation = `None of their buddies are on ${teamName(curTeam)}.`;
      const counts = new Map<string, number>();
      for (const b of sameDiv) {
        const tid = assign.get(b.id) ?? null;
        if (tid && tid !== curTeam) counts.set(tid, (counts.get(tid) ?? 0) + 1);
      }
      const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      if (best) suggestion = { teamId: best[0], label: teamName(best[0]), tradeoffs: tradeoffs(best[0]) };
    } else if (crossDiv.length > 0) {
      // Matched, but in another division — not fixable within this board.
      status = "na";
      const divs = [...new Set(crossDiv.map((b) => divName.get(b.divisionId) ?? "another division"))];
      explanation =
        `${crossDiv.map((b) => b.name).join(", ")} ${crossDiv.length > 1 ? "are" : "is"} in ${divs.join(", ")} — ` +
        `a different division, so they can't share a team. To reunite them, move ${player.name.split(" ")[0]} (or the buddy) into the same division.`;
    } else {
      // Requested a teammate but no one on any roster matched the name.
      status = "na";
      explanation = `No one on any roster matches “${rawBuddyText}”. They may not have signed up, or the name is spelled differently — you can still place ${player.name.split(" ")[0]} manually.`;
    }

    lines.push({ key: "buddy", label: `Buddies — ${namesLabel || "—"}`, status, explanation, suggestion });
  }

  const teamNight = nightOf(curTeam);
  if (teamNight) {
    const met = player.nights.includes(teamNight);
    let suggestion: Suggestion | undefined;
    if (!met) {
      const t = divisionTeams.find((x) => x.night && player.nights.includes(x.night) && x.id !== curTeam);
      if (t) suggestion = { teamId: t.id, label: t.name, tradeoffs: tradeoffs(t.id) };
    }
    lines.push({
      key: "night",
      label: `Practice night — ${teamNight}`,
      status: met ? "met" : "unmet",
      explanation: met
        ? `Available ${teamNight}.`
        : `Available ${player.nights.join(", ") || "no nights given"} — not ${teamNight}.`,
      suggestion,
    });
  }

  const unmet = lines.filter((l) => l.status === "unmet").length;
  const na = lines.filter((l) => l.status === "na").length;
  const statusText =
    unmet > 0
      ? `${unmet} unmet request${unmet === 1 ? "" : "s"}`
      : na > 0
      ? `${na} request${na === 1 ? "" : "s"} can't be met here`
      : "all requests met";

  // The player's original CSV row — show every non-empty field verbatim.
  const rawEntries = Object.entries(player.raw ?? {})
    .map(([k, v]) => [k, v == null ? "" : String(v)] as const)
    .filter(([, v]) => v.trim() !== "");
  const [showRaw, setShowRaw] = useState(true);
  const curDivisionId = player.divisionId;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">{player.name}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              On {teamName(curTeam)} · {statusText}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-xl leading-none">
            ×
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {lines.length === 0 && <p className="text-sm text-gray-500">No coach, team, buddy, or practice-night requests.</p>}
          {lines.map((l) => (
            <div key={l.key}>
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${l.status === "met" ? "bg-green-500" : l.status === "na" ? "bg-gray-400" : "bg-red-500"}`} />
                <span className="text-sm font-medium text-gray-900 dark:text-white">{l.label}</span>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 ml-4 mt-0.5">{l.explanation}</p>
              {l.suggestion && (
                <div className="ml-4 mt-2 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-blue-50/50 dark:bg-blue-950/20 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => { onMove(player.id, l.suggestion!.teamId); onClose(); }}
                    className="text-sm font-semibold text-blue-700 dark:text-blue-300 hover:underline"
                  >
                    Move to {l.suggestion.label}
                  </button>
                  {l.suggestion.tradeoffs.length > 0 ? (
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                      Tradeoff: {l.suggestion.tradeoffs.join("; ")}.
                    </p>
                  ) : (
                    <p className="text-xs text-green-700 dark:text-green-400 mt-1">No other request would be broken.</p>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* The full original signup row */}
          {rawEntries.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowRaw((s) => !s)}
                className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <span>Signup entry</span>
                <span>{showRaw ? "−" : "+"}</span>
              </button>
              {showRaw && (
                <dl className="mt-2 space-y-1.5">
                  {rawEntries.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[40%_60%] gap-2 text-xs">
                      <dt className="text-gray-400 dark:text-gray-500 truncate" title={k}>{k}</dt>
                      <dd className="text-gray-800 dark:text-gray-200 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
        </div>

        {/* Move to any team (drag-free) */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-20">Team</span>
          <select
            value={curTeam ?? ""}
            onChange={(e) => { onMove(player.id, e.target.value || null); onClose(); }}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            <option value="">Unassigned</option>
            {divisionTeams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
                {domCoach(t.id) ? ` — ${coachLabel(domCoach(t.id))}` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Move to a different division (play-up / play-down). Clears the team. */}
        <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 w-20">Division</span>
          <select
            value={curDivisionId}
            onChange={(e) => { if (e.target.value && e.target.value !== curDivisionId) onMoveDivision(player.id, e.target.value); }}
            className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <p className="px-5 pb-3 text-[11px] text-gray-400">
          Moving divisions drops the team — they&rsquo;ll be Unassigned in the new division, ready to place.
        </p>
      </div>
    </div>
  );
}
