import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "./db";
import { extractIntent, type RawPlayer } from "./resolve/extract";
import { clusterStrings } from "./resolve/cluster";
import { normalize, jaroWinkler } from "./resolve/similarity";

export type TeamPairing = {
  name: string; // team name, or coach name if no team
  coach: string; // dominant coach when the team has a name; "" otherwise
  count: number;
  needsReview: boolean; // coach/team came from a borderline merge — worth a look
  variants: string[]; // the distinct spellings that were merged (only when needsReview)
};
export type DivisionPairing = { division: string; teams: TeamPairing[]; total: number };

export type AnalyzeResult = {
  summary: { players: number; divisions: number; coaches: number; teams: number; buddyLinks: number };
  pairings: DivisionPairing[];
  // Kept for the board (not shown on the confirm screen).
  playUps: { playerId: string; playerName: string; division: string; note: string }[];
  unmatchedBuddies: { playerId: string; playerName: string; names: string[] }[];
  error?: string;
};

const EMPTY: AnalyzeResult = {
  summary: { players: 0, divisions: 0, coaches: 0, teams: 0, buddyLinks: 0 },
  pairings: [],
  playUps: [],
  unmatchedBuddies: [],
};

const argmax = (m: Map<string, number>): string => {
  let best = "";
  let n = -1;
  for (const [k, v] of m) if (v > n) { n = v; best = k; }
  return best;
};
const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

// Veto a coach merge when two simple "First Last" names share a first name but
// have clearly different surnames — different people, not a typo. Co-coach
// strings ("Steve Schon and Kyle") have >2 tokens and are left to the scorer.
function differentSurnames(a: string, b: string): boolean {
  const ta = a.split(/\s+/);
  const tb = b.split(/\s+/);
  if (ta.length !== 2 || tb.length !== 2) return false;
  // <0.7 on the surname is a real difference (ahern/lenhart ≈ 0.62); ordinary
  // misspellings of one surname stay well above (gennaro/generro ≈ 0.87).
  return jaroWinkler(ta[0], tb[0]) >= 0.9 && jaroWinkler(ta[1], tb[1]) < 0.7;
}

function matchBuddyName(
  name: string,
  roster: { id: string; full: string }[],
  selfId: string,
  threshold = 0.86
): string | null {
  const target = normalize(name);
  if (!target) return null;
  let best: string | null = null;
  let bestScore = threshold;
  for (const r of roster) {
    if (r.id === selfId) continue;
    const score = jaroWinkler(target, r.full);
    if (score >= bestScore) {
      bestScore = score;
      best = r.id;
    }
  }
  return best;
}

// The full analysis: Claude extracts intent for every player (reporting
// progress), we canonicalize the cleaned names + match buddies, AUTO-APPLY it
// all, and return only the items worth a human look. Pure-ish: caller provides
// the Supabase client (so a route handler or an action can both drive it).
export async function runAnalysis(
  supabase: SupabaseClient,
  seasonId: string,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<AnalyzeResult> {
  const t0 = Date.now();
  const rows = await selectAll((from, to) =>
    supabase
      .from("tb_players")
      .select(
        "id, first_name, last_name, division_id, package_name, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights, school"
      )
      .eq("season_id", seasonId)
      .order("id")
      .range(from, to)
  );
  console.error(`[analyze] season ${seasonId}: ${rows.length} players loaded`);
  if (rows.length === 0) return EMPTY;
  // Push the total immediately so the client's progress bar shows 0/N right away
  // (proves the stream is live before the first batch finishes).
  onProgress?.(0, rows.length);

  const idOf = (p: Record<string, unknown>) => p.id as string;
  const nameById = new Map(rows.map((p) => [idOf(p), `${p.first_name} ${p.last_name}`.trim()]));

  const raw: RawPlayer[] = rows.map((p) => ({
    id: idOf(p),
    coachFirst: (p.coach_first as string) ?? "",
    coachLast: (p.coach_last as string) ?? "",
    team: (p.team_name as string) ?? "",
    buddyFirst: (p.buddy_first as string) ?? "",
    buddyLast: (p.buddy_last as string) ?? "",
    nights: (p.practice_nights as string) ?? "",
    school: (p.school as string) ?? "",
    division: (p.package_name as string) ?? "",
  }));

  const intents = await extractIntent(raw, onProgress, signal);
  console.error(`[analyze] extraction done in ${((Date.now() - t0) / 1000).toFixed(1)}s; applying…`);
  const intentById = new Map(intents.map((i) => [i.id, i]));

  const playerIds = rows.map(idOf);
  const primaryCoach = (id: string) => intentById.get(id)?.coaches[0] ?? "";
  const teamOf = (id: string) => intentById.get(id)?.team ?? "";

  const coachClusters = clusterStrings(
    playerIds.map((id, idx) => ({ id: idx, value: primaryCoach(id) })).filter((x) => x.value),
    0.9,
    differentSurnames
  );
  const teamClusters = clusterStrings(
    playerIds.map((id, idx) => ({ id: idx, value: teamOf(id) })).filter((x) => x.value)
  );

  // Per-player canonical coach/team from the clustering above.
  const coachCanonOf = new Map<number, string>();
  coachClusters.forEach((c) => c.ids.forEach((i) => coachCanonOf.set(i, c.canonical)));
  const teamCanonOf = new Map<number, string>();
  teamClusters.forEach((c) => c.ids.forEach((i) => teamCanonOf.set(i, c.canonical)));

  // Fold minority coach spellings on a team into that team's dominant coach
  // when they share a name token: on "Playoff Pixies", "Brian A" / "Shane Brian"
  // → "Shelli Brian" (all share "brian"); on "Boltz", "Zac" → "Zac Czosnyka".
  // These are too different for the fuzzy matcher (Shelli Brian vs Brian A ≈
  // 0.56) but the shared team + shared name token makes them the same coach.
  // Without this the minority spelling becomes its own coach → a falsely-flagged
  // coach-unmet kid and, under coach-protection, a split team.
  const teamDivCoaches = new Map<string, Map<string, number>>(); // `${team}::${div}` -> coach -> n
  rows.forEach((p, idx) => {
    const c = coachCanonOf.get(idx) ?? "";
    const t = teamCanonOf.get(idx) ?? "";
    const div = (p.package_name as string) ?? "";
    if (c && t) {
      const k = `${t}::${div}`;
      if (!teamDivCoaches.has(k)) teamDivCoaches.set(k, new Map());
      inc(teamDivCoaches.get(k)!, c);
    }
  });
  // Match on real name tokens only — junk/placeholder words must never bridge
  // two coaches (e.g. "Neff None" and "None None" both contain "none").
  const STOP = new Set(["none", "coach", "team", "not", "sure", "null", "unknown", "the", "and"]);
  const tokensOf = (name: string) =>
    new Set(normalize(name).split(" ").filter((t) => t.length >= 3 && !STOP.has(t)));
  // A coach that leads its own team somewhere is never folded away.
  const leadsATeam = new Set<string>();
  for (const counts of teamDivCoaches.values()) leadsATeam.add(argmax(counts));
  const coachRemap = new Map<string, string>();
  for (const counts of teamDivCoaches.values()) {
    const dom = argmax(counts);
    const domTokens = tokensOf(dom);
    for (const c of counts.keys()) {
      if (c === dom || leadsATeam.has(c) || coachRemap.has(c)) continue;
      if ([...tokensOf(c)].some((t) => domTokens.has(t))) coachRemap.set(c, dom);
    }
  }
  if (coachRemap.size) {
    coachCanonOf.forEach((v, k) => {
      const r = coachRemap.get(v);
      if (r) coachCanonOf.set(k, r);
    });
  }

  // Inference: a coach runs one team per division. Learn each team's coach
  // (Showtime → Connor Small) and each coach's team per division (Brent
  // Clissold → Trojans in 8U, Desert Storm in 10U) from signups that have both,
  // then fill gaps so a coach's named + unnamed players consolidate.
  const teamCoachCount = new Map<string, Map<string, number>>();
  const coachDivTeamCount = new Map<string, Map<string, number>>(); // `${coach}::${div}` -> team counts
  rows.forEach((p, idx) => {
    const coach = coachCanonOf.get(idx) ?? "";
    const team = teamCanonOf.get(idx) ?? "";
    const div = (p.package_name as string) ?? "";
    if (team && coach) {
      if (!teamCoachCount.has(team)) teamCoachCount.set(team, new Map());
      inc(teamCoachCount.get(team)!, coach);
      const k = `${coach}::${div}`;
      if (!coachDivTeamCount.has(k)) coachDivTeamCount.set(k, new Map());
      inc(coachDivTeamCount.get(k)!, team);
    }
  });
  const teamCoach = (t: string) => (teamCoachCount.has(t) ? argmax(teamCoachCount.get(t)!) : "");
  const coachDivTeam = (c: string, d: string) => {
    const m = coachDivTeamCount.get(`${c}::${d}`);
    return m ? argmax(m) : "";
  };

  // Group players into the teams that will actually form: keyed by coach (so a
  // coach's named + unnamed kids merge), else by team name.
  type Grp = {
    div: string;
    coachCount: Map<string, number>;
    teamCount: Map<string, number>;
    ids: string[];
    coachSp: Set<string>; // distinct coach spellings actually in this group
    teamSp: Set<string>; // distinct team spellings actually in this group
  };
  const groups = new Map<string, Grp>();
  rows.forEach((p, idx) => {
    const rawCoach = coachCanonOf.get(idx) ?? "";
    const rawTeam = teamCanonOf.get(idx) ?? "";
    const div = (p.package_name as string) ?? "";
    const coach = rawCoach || teamCoach(rawTeam);
    const team = rawTeam || (coach ? coachDivTeam(coach, div) : "");
    const keyId = coach || team;
    if (!keyId) return; // no coach/team request — a free agent
    const gkey = `${div}::${keyId}`;
    if (!groups.has(gkey))
      groups.set(gkey, { div, coachCount: new Map(), teamCount: new Map(), ids: [], coachSp: new Set(), teamSp: new Set() });
    const g = groups.get(gkey)!;
    if (coach) inc(g.coachCount, coach);
    if (team) inc(g.teamCount, team);
    // Track the cleaned spellings the parents actually wrote in THIS division,
    // so the confirm screen only shows merges that happened here (not a typo
    // from a different division sharing the same canonical name).
    const cSpell = primaryCoach(idOf(p));
    const tSpell = teamOf(idOf(p));
    if (cSpell) g.coachSp.add(cSpell);
    if (tSpell) g.teamSp.add(tSpell);
    g.ids.push(idOf(p));
  });

  // ── Auto-apply: wipe + rewrite canonical entities and the consolidated refs ─
  await supabase.from("tb_buddy_links").delete().eq("season_id", seasonId);
  await supabase.from("tb_coaches").delete().eq("season_id", seasonId);
  await supabase.from("tb_team_names").delete().eq("season_id", seasonId);

  const coachNames = [
    ...new Set(coachClusters.map((c) => c.canonical).filter((n) => n && !coachRemap.has(n))),
  ];
  const teamNames = [...new Set(teamClusters.map((c) => c.canonical).filter(Boolean))];
  const coachIdByName = new Map<string, string>();
  const teamIdByName = new Map<string, string>();
  if (coachNames.length) {
    const { data, error } = await supabase.from("tb_coaches").insert(coachNames.map((name) => ({ season_id: seasonId, name }))).select("id, name");
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => coachIdByName.set(r.name as string, r.id as string));
  }
  if (teamNames.length) {
    const { data, error } = await supabase.from("tb_team_names").insert(teamNames.map((name) => ({ season_id: seasonId, name }))).select("id, name");
    if (error) throw new Error(error.message);
    (data ?? []).forEach((r) => teamIdByName.set(r.name as string, r.id as string));
  }

  // Assign every group's members to its dominant coach + team.
  for (const g of groups.values()) {
    const coachId = coachIdByName.get(argmax(g.coachCount));
    const teamId = teamIdByName.get(argmax(g.teamCount));
    if (coachId) {
      const { error } = await supabase.from("tb_players").update({ resolved_coach_id: coachId }).in("id", g.ids);
      if (error) throw new Error(error.message);
    }
    if (teamId) {
      const { error } = await supabase.from("tb_players").update({ resolved_team_name_id: teamId }).in("id", g.ids);
      if (error) throw new Error(error.message);
    }
  }
  const coachCount = coachNames.length;
  const teamCount = teamNames.length;

  const roster = rows.map((p) => ({ id: idOf(p), full: normalize(nameById.get(idOf(p)) ?? "") }));
  const links: { season_id: string; from_player_id: string; to_player_id: string }[] = [];
  const seen = new Set<string>();
  const unmatchedBuddies: AnalyzeResult["unmatchedBuddies"] = [];
  for (const p of rows) {
    const intent = intentById.get(idOf(p));
    if (!intent?.buddies.length) continue;
    const misses: string[] = [];
    for (const name of intent.buddies) {
      const toId = matchBuddyName(name, roster, idOf(p));
      if (!toId) {
        misses.push(name);
        continue;
      }
      const key = `${idOf(p)}->${toId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ season_id: seasonId, from_player_id: idOf(p), to_player_id: toId });
    }
    if (misses.length) unmatchedBuddies.push({ playerId: idOf(p), playerName: nameById.get(idOf(p)) ?? "", names: misses });
  }
  if (links.length) {
    const { error } = await supabase.from("tb_buddy_links").insert(links);
    if (error) throw new Error(error.message);
  }

  // Persist the ordered coach options (fallbacks) for players who listed more
  // than one. Primary is already in resolved_coach_id; this keeps the rest.
  // Non-fatal: if migration 037 (coach_options column) isn't applied yet, skip.
  try {
    for (const p of rows) {
      const intent = intentById.get(idOf(p));
      if (intent && intent.coaches.length > 1) {
        const { error } = await supabase.from("tb_players").update({ coach_options: intent.coaches }).eq("id", idOf(p));
        if (error) throw error;
      }
    }
  } catch (e) {
    console.error("[analyze] skipped coach_options (apply migration 037?):", e instanceof Error ? e.message : e);
  }

  await supabase.from("tb_seasons").update({ status: "resolved" }).eq("id", seasonId);

  // ── Pairings, organized by division → team (the confirm screen) ────────────
  // Flag a pairing for a human look only when it actually combined materially
  // DIFFERENT spellings — not ordinary typos/nicknames. Measure the least-
  // similar pair among the spellings present: obvious typos stay high
  // (Mike/Michael ≈ 0.92, Bolts/Boltz ≈ 0.92), while a coach group whose
  // families wrote genuinely different team names (Crusaders vs Warriors ≈ 0)
  // drops near zero. Below the bar is worth confirming; above clears itself.
  // There's a clean gap in real data between ~0.82 (typos) and ~0.0 (different
  // names), so 0.8 isolates the real ambiguities.
  const REVIEW_BAR = 0.8;
  const minPairSim = (set: Set<string>): number => {
    const vs = [...set];
    let m = 1;
    for (let i = 0; i < vs.length; i++)
      for (let j = i + 1; j < vs.length; j++) m = Math.min(m, jaroWinkler(normalize(vs[i]), normalize(vs[j])));
    return vs.length > 1 ? m : 1;
  };

  const byDiv = new Map<string, TeamPairing[]>();
  for (const g of groups.values()) {
    const coach = argmax(g.coachCount);
    const team = argmax(g.teamCount);
    const hasTeamName = !!team;
    const coachReview = g.coachSp.size > 1 && minPairSim(g.coachSp) < REVIEW_BAR;
    const teamReview = hasTeamName && g.teamSp.size > 1 && minPairSim(g.teamSp) < REVIEW_BAR;
    const variants = [
      ...(coachReview ? [...g.coachSp] : []),
      ...(teamReview ? [...g.teamSp] : []),
    ];
    if (!byDiv.has(g.div)) byDiv.set(g.div, []);
    byDiv.get(g.div)!.push({
      name: team || coach || "(no request)",
      coach: hasTeamName ? coach : "", // when the name IS the coach, don't repeat it
      count: g.ids.length,
      needsReview: coachReview || teamReview,
      variants: [...new Set(variants)],
    });
  }

  const pairings: DivisionPairing[] = [...byDiv.entries()]
    .map(([division, teams]) => ({
      division,
      teams: teams.sort((a, b) => b.count - a.count),
      total: teams.reduce((s, t) => s + t.count, 0),
    }))
    .sort((a, b) => a.division.localeCompare(b.division));

  const playUps: AnalyzeResult["playUps"] = [];
  for (const p of rows) {
    const intent = intentById.get(idOf(p));
    if (intent?.playUp) {
      playUps.push({
        playerId: idOf(p),
        playerName: nameById.get(idOf(p)) ?? "",
        division: (p.package_name as string) ?? "",
        note: intent.notes || `${intent.coaches.join(", ")} ${intent.team}`.trim(),
      });
    }
  }

  revalidatePath(`/tools/roster-creator/${seasonId}`);
  console.error(`[analyze] complete in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${coachCount} coaches, ${teamCount} teams, ${links.length} buddy links`);

  return {
    summary: {
      players: rows.length,
      divisions: new Set(rows.map((p) => p.package_name as string).filter(Boolean)).size,
      coaches: coachCount,
      teams: teamCount,
      buddyLinks: links.length,
    },
    pairings,
    playUps,
    unmatchedBuddies,
  };
}
