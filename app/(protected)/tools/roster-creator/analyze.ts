import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selectAll } from "./db";
import { extractIntent, type RawPlayer } from "./resolve/extract";
import { normalize, jaroWinkler } from "./resolve/similarity";
import { matchCoachOptions, type CoachCandidate } from "./resolve/match-coach";
import { isCoachChild, accountNameOf, isNoRequest } from "./fields";

export type TeamPairing = {
  name: string; // the team's coach (authoritative roster name)
  coach: string; // kept for shape compatibility; "" — the name IS the coach
  count: number; // players matched onto this team
  needsReview: boolean; // an ambiguous coach-kid / shared-surname landed here
  variants: string[]; // the ambiguous player names worth a look
};
export type DivisionPairing = { division: string; teams: TeamPairing[]; total: number };

// A player who requested a coach who isn't on this division's roster — the
// request can't be honored, so they become a free agent the balancer places.
export type UnmatchedCoach = {
  playerId: string;
  playerName: string;
  division: string;
  requested: string[];
};

export type AnalyzeResult = {
  summary: { players: number; divisions: number; coaches: number; teams: number; buddyLinks: number };
  pairings: DivisionPairing[];
  playUps: { playerId: string; playerName: string; division: string; note: string }[];
  unmatchedBuddies: { playerId: string; playerName: string; names: string[] }[];
  unmatchedCoaches: UnmatchedCoach[];
  error?: string;
};

const EMPTY: AnalyzeResult = {
  summary: { players: 0, divisions: 0, coaches: 0, teams: 0, buddyLinks: 0 },
  pairings: [],
  playUps: [],
  unmatchedBuddies: [],
  unmatchedCoaches: [],
};

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

// The full analysis under the new authoritative-roster model. The divisions,
// coaches, and teams already exist (uploaded as the coach workbook). So this no
// longer DISCOVERS entities by clustering — it MATCHES each player's cleaned
// request against their division's known coaches, AUTO-APPLIES the assignment
// (resolved_coach_id) and buddy links, and returns what's worth a human look:
// ambiguous coach-kids and requests that matched no coach on the roster.
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
        "id, first_name, last_name, division_id, package_name, coach_first, coach_last, team_name, buddy_first, buddy_last, practice_nights, school, raw"
      )
      .eq("season_id", seasonId)
      .order("id")
      .range(from, to)
  );
  console.error(`[analyze] season ${seasonId}: ${rows.length} players loaded`);
  if (rows.length === 0) return EMPTY;
  onProgress?.(0, rows.length);

  // ── Authoritative roster: divisions + coached teams → per-division candidates
  const [{ data: divisions }, { data: teams }, { data: coaches }] = await Promise.all([
    supabase.from("tb_divisions").select("id, name").eq("season_id", seasonId),
    supabase.from("tb_teams").select("id, division_id, coach_id").eq("season_id", seasonId),
    supabase.from("tb_coaches").select("id, name").eq("season_id", seasonId),
  ]);
  const coachNameById = new Map((coaches ?? []).map((c) => [c.id as string, c.name as string]));
  const divNameById = new Map((divisions ?? []).map((d) => [d.id as string, d.name as string]));

  // division_id -> the coaches who lead a team in that division.
  const candidatesByDiv = new Map<string, CoachCandidate[]>();
  for (const t of teams ?? []) {
    const cid = t.coach_id as string | null;
    if (!cid) continue;
    const dz = t.division_id as string;
    if (!candidatesByDiv.has(dz)) candidatesByDiv.set(dz, []);
    const list = candidatesByDiv.get(dz)!;
    if (!list.some((c) => c.id === cid)) list.push({ id: cid, name: coachNameById.get(cid) ?? "" });
  }

  const idOf = (p: Record<string, unknown>) => p.id as string;
  const nameById = new Map(rows.map((p) => [idOf(p), `${p.first_name} ${p.last_name}`.trim()]));

  // ── Skip rows with NO request at all (every request field is a no-request
  //    token). Claude can extract nothing from them, so don't spend a call — a
  //    pure speedup with zero quality change. Rows with ANY content (even messy
  //    noise like "Jone" or "last season") still go to Claude, which discards
  //    what isn't a real request. ──────────────────────────────────────────────
  const hasRequest = (p: Record<string, unknown>) =>
    [p.coach_first, p.coach_last, p.team_name, p.buddy_first, p.buddy_last].some(
      (v) => !isNoRequest((v as string) ?? "")
    );
  const needRows = rows.filter(hasRequest);
  const skipped = rows.length - needRows.length;
  console.error(`[analyze] ${skipped} no-request rows skipped; ${needRows.length} → Claude`);

  // ── Roster-aware extraction: feed each player their division's coach names ──
  const raw: RawPlayer[] = needRows.map((p) => {
    const dz = p.division_id as string | null;
    const cand = dz ? candidatesByDiv.get(dz) ?? [] : [];
    return {
      id: idOf(p),
      coachFirst: (p.coach_first as string) ?? "",
      coachLast: (p.coach_last as string) ?? "",
      team: (p.team_name as string) ?? "",
      buddyFirst: (p.buddy_first as string) ?? "",
      buddyLast: (p.buddy_last as string) ?? "",
      nights: (p.practice_nights as string) ?? "",
      school: (p.school as string) ?? "",
      division: (p.package_name as string) ?? "",
      coachCandidates: cand.map((c) => c.name).filter(Boolean),
    };
  });

  // Progress stays denominated over ALL players (skipped rows are instantly done).
  const intents = await extractIntent(
    raw,
    (done, total) => onProgress?.(skipped + done, skipped + total),
    signal
  );
  console.error(`[analyze] extraction done in ${((Date.now() - t0) / 1000).toFixed(1)}s; matching…`);
  const intentById = new Map(intents.map((i) => [i.id, i]));

  // ── Match each player's coach request against THEIR division's roster ───────
  const coachAssign = new Map<string, string>(); // playerId -> coachId
  const unmatchedCoaches: UnmatchedCoach[] = [];
  // div_id -> coachId -> count, and div_id -> coachId -> ambiguous player names.
  const countByDiv = new Map<string, Map<string, number>>();
  const ambiguousByDiv = new Map<string, Map<string, string[]>>();
  const bump = (m: Map<string, Map<string, number>>, dz: string, cid: string) => {
    if (!m.has(dz)) m.set(dz, new Map());
    const inner = m.get(dz)!;
    inner.set(cid, (inner.get(cid) ?? 0) + 1);
  };
  const flagAmbiguous = (dz: string, cid: string, name: string) => {
    if (!ambiguousByDiv.has(dz)) ambiguousByDiv.set(dz, new Map());
    const inner = ambiguousByDiv.get(dz)!;
    inner.set(cid, [...(inner.get(cid) ?? []), name]);
  };

  for (const p of rows) {
    const pid = idOf(p);
    const dz = p.division_id as string | null;
    if (!dz) continue;
    const candidates = candidatesByDiv.get(dz) ?? [];
    if (candidates.length === 0) continue;
    const intent = intentById.get(pid);

    let coachId: string | null = null;
    let ambiguous = false;
    let reason = ""; // why it's ambiguous — shown on the confirm screen

    // 1) Coach's-kid wins — a coach's child is always on their parent's team.
    const account = accountNameOf(p.raw);
    const last = (p.last_name as string) ?? "";
    const kidMatches = candidates.filter((c) => isCoachChild(last, account, c.name));
    if (kidMatches.length === 1) {
      coachId = kidMatches[0].id;
    } else if (kidMatches.length > 1) {
      // Two coaches share the surname (e.g. two Wilsons). Disambiguate by the
      // requested coach / registering account; flag if still unclear.
      const disamb = matchCoachOptions([...(intent?.coaches ?? []), account], kidMatches);
      coachId = disamb?.coachId ?? kidMatches[0].id;
      ambiguous = !disamb || disamb.ambiguous;
      if (ambiguous) reason = `shares the ${last} surname with ${kidMatches.length} coaches`;
    }

    // 2) Otherwise match the explicit coach request(s) to the roster.
    if (!coachId) {
      const m = matchCoachOptions(intent?.coaches ?? [], candidates);
      if (m) {
        coachId = m.coachId;
        ambiguous = m.ambiguous;
        if (ambiguous) {
          const req = (intent?.coaches ?? []).join(" / ");
          reason = req ? `requested “${req}” — matches more than one coach` : "matches more than one coach";
        }
      } else if ((intent?.coaches ?? []).length > 0) {
        unmatchedCoaches.push({
          playerId: pid,
          playerName: nameById.get(pid) ?? "",
          division: divNameById.get(dz) ?? "",
          requested: intent!.coaches,
        });
      }
    }

    if (coachId) {
      coachAssign.set(pid, coachId);
      bump(countByDiv, dz, coachId);
      if (ambiguous) flagAmbiguous(dz, coachId, `${nameById.get(pid) ?? ""} — ${reason}`);
    }
  }

  // ── Persist. Do NOT touch the authoritative tb_coaches / tb_teams; only reset
  //    the per-player resolution refs + buddy links, then write the matches. ──
  await supabase.from("tb_buddy_links").delete().eq("season_id", seasonId);
  await supabase
    .from("tb_players")
    .update({ resolved_coach_id: null, resolved_team_name_id: null })
    .eq("season_id", seasonId);

  const idsByCoach = new Map<string, string[]>();
  for (const [pid, cid] of coachAssign) {
    if (!idsByCoach.has(cid)) idsByCoach.set(cid, []);
    idsByCoach.get(cid)!.push(pid);
  }
  for (const [cid, ids] of idsByCoach) {
    const { error } = await supabase.from("tb_players").update({ resolved_coach_id: cid }).in("id", ids);
    if (error) throw new Error(error.message);
  }

  // ── Buddy links (deterministic name match against the full roster) ─────────
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

  // Keep the ordered coach options (fallbacks) for players who listed more than
  // one. Non-fatal if migration 037 (coach_options column) isn't applied.
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

  // ── Confirm screen: every coached team in each division + how many landed,
  //    flagging the teams that drew an ambiguous coach-kid for a quick look. ──
  const pairings: DivisionPairing[] = (divisions ?? [])
    .map((d) => {
      const dz = d.id as string;
      const cands = candidatesByDiv.get(dz) ?? [];
      const counts = countByDiv.get(dz) ?? new Map<string, number>();
      const amb = ambiguousByDiv.get(dz) ?? new Map<string, string[]>();
      const tlist: TeamPairing[] = cands
        .map((c) => ({
          name: c.name,
          coach: "",
          count: counts.get(c.id) ?? 0,
          needsReview: (amb.get(c.id)?.length ?? 0) > 0,
          variants: [...new Set(amb.get(c.id) ?? [])],
        }))
        .sort((a, b) => b.count - a.count);
      return {
        division: d.name as string,
        teams: tlist,
        total: tlist.reduce((s, t) => s + t.count, 0),
      };
    })
    .sort((a, b) => a.division.localeCompare(b.division));

  const playUps: AnalyzeResult["playUps"] = [];
  for (const p of rows) {
    const intent = intentById.get(idOf(p));
    if (intent?.playUp) {
      playUps.push({
        playerId: idOf(p),
        playerName: nameById.get(idOf(p)) ?? "",
        division: (p.package_name as string) ?? "",
        note: intent.notes || intent.coaches.join(", "),
      });
    }
  }

  revalidatePath(`/tools/roster-creator/${seasonId}`);
  console.error(
    `[analyze] complete in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${coachAssign.size} matched, ` +
      `${unmatchedCoaches.length} unmatched coach requests, ${links.length} buddy links`
  );

  return {
    summary: {
      players: rows.length,
      divisions: (divisions ?? []).length,
      coaches: (coaches ?? []).length,
      teams: (teams ?? []).length,
      buddyLinks: links.length,
    },
    pairings,
    playUps,
    unmatchedBuddies,
    unmatchedCoaches,
  };
}
