// Per-division assignment engine. Pure and deterministic — no DB, no API.
// The admin now uploads an authoritative coach/teams list, so the set of teams
// per division is FIXED and known up front. This engine ASSIGNS players into
// that fixed set of teams — it never invents a team and never drops one.
//
// Spirit (ported from the old grouping engine): a coach's own kids and a
// coach's requesters anchor onto that coach's team and may push it over the
// target; only FREE agents are blocked from overfilling. Buddies pull a free
// agent onto a buddy's team. Leftover free agents fill the open placeholder
// teams (and any under-target coached teams) toward the target, preferring the
// fuller team and a matching practice night.

export type Weights = { coach: number; team: number; buddy: number; night: number };
export type GroupConfig = { target: number; weights: Weights };

export const DEFAULT_CONFIG: GroupConfig = {
  target: 12,
  weights: { coach: 8, team: 6, buddy: 3, night: 1 },
};

// Accept legacy {minSize,maxSize} configs and coerce to a target.
export function normalizeConfig(
  raw: (Partial<GroupConfig> & { minSize?: number; maxSize?: number }) | null | undefined
): GroupConfig {
  return {
    target: raw?.target ?? raw?.maxSize ?? DEFAULT_CONFIG.target,
    weights: raw?.weights ?? DEFAULT_CONFIG.weights,
  };
}

export const NIGHTS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// Parse the free-text practice-night cell into canonical day names.
export function parseNights(raw: string): string[] {
  if (!raw) return [];
  const lower = raw.toLowerCase();
  return NIGHTS.filter((n) => lower.includes(n.toLowerCase()));
}

export type GroupPlayer = {
  id: string;
  coachId: string | null;
  // True if the family asked for a coach at all — even one not on the roster
  // (coachId null). Lets "coach unmet" flag unmatched requests, not just
  // matched-but-wrong-team ones. Defaults to "has a matched coach" when unset.
  coachReq?: boolean;
  teamNameId: string | null;
  nights: string[];
  buddyIds: string[];
};

// Best night for a set of players: the day the most members have free.
function bestNight(members: GroupPlayer[]): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const night of NIGHTS) {
    const count = members.filter((m) => m.nights.includes(night)).length;
    if (count > bestCount) {
      bestCount = count;
      best = night;
    }
  }
  return best;
}

// ── Fixed-team assignment ────────────────────────────────────────────────────

// One of the division's authoritative teams. The count is FIXED: assignDivision
// receives these and returns exactly these, never more, never fewer.
export type FixedTeam = {
  id: string; // tb_teams.id
  coachId: string | null; // null for an open "Team N" placeholder
  isPlaceholder: boolean;
};

export type AssignInput = {
  teams: FixedTeam[]; // the division's authoritative teams (FIXED count)
  players: GroupPlayer[]; // GroupPlayer already carries: id, coachId, teamNameId, nights, buddyIds
  targetSize: number; // players-per-team target for this division
  protectedCoachIds?: Set<string>; // coaches whose own child is enrolled here — inviolable
  weights?: Weights; // request priorities — used by the refinement pass
  lockedTeamIds?: Set<string>; // teams the refinement pass must never touch
};

export type TeamAssignment = { teamId: string; playerIds: string[]; night: string | null };
export type AssignResult = { assignments: TeamAssignment[] };

// A team plus its growing member list while we assign. Index into AssignInput.teams.
type WorkingTeam = {
  team: FixedTeam;
  members: GroupPlayer[];
};

// How well a unit (a single player or a buddy cluster) fits a team's EMERGING
// practice night. A team's final night is bestNight(members), and a player's
// night is "met" when they're free on it — so matching against the team's
// current bestNight directly optimizes night satisfaction. Returns a 0..2 score
// that dominates the small fullness tiebreak used alongside it:
//   • all members free on the team's night  → 2  (great fit)
//   • empty team                            → 1.2 ("open" — the unit sets its night)
//   • nobody free on the team's night        → 0  (avoid)
// Members with no night preference are ignored; a unit with none returns a
// neutral 1 so consolidation (fullness) alone decides where they land.
function nightFit(members: GroupPlayer[], team: WorkingTeam): number {
  const withPref = members.filter((m) => m.nights.length > 0);
  if (withPref.length === 0) return 1;
  const night = bestNight(team.members);
  if (!night) return 1.2;
  const free = withPref.filter((m) => m.nights.includes(night)).length / withPref.length;
  return 2 * free;
}

// Imbalance cost of a team: squared distance from target (empty placeholders are
// free — we never force-fill one). Summed over teams, this is what the refinement
// pass drives down: a 24-player team next to a 6-player team is very expensive.
function penalty(size: number, target: number): number {
  return size === 0 ? 0 : (size - target) ** 2;
}

// Total satisfied-request weight for a team's roster: coach + buddy + night, using
// the configured weights — exactly the requests flagsFor reports, so the engine and
// the board agree on what "met" means. Night is the team's emergent bestNight.
function teamScore(members: GroupPlayer[], coachId: string | null, w: Weights): number {
  if (members.length === 0) return 0;
  const ids = new Set(members.map((m) => m.id));
  const night = bestNight(members);
  let s = 0;
  for (const m of members) {
    if (m.coachId != null && coachId === m.coachId) s += w.coach;
    if (m.buddyIds.length > 0 && m.buddyIds.some((b) => ids.has(b))) s += w.buddy;
    if (night && m.nights.includes(night)) s += w.night;
  }
  return s;
}

// Connected components of a team's MOVABLE members under buddy adjacency
// (restricted to the team). Each is a unit the refiner can relocate without
// splitting buddies who are currently together. Deterministic (member order).
function movableComponents(
  src: WorkingTeam,
  movable: (p: GroupPlayer, wt: WorkingTeam) => boolean
): GroupPlayer[][] {
  const mem = src.members.filter((m) => movable(m, src));
  const set = new Set(mem.map((m) => m.id));
  const byId = new Map(mem.map((m) => [m.id, m]));
  const seen = new Set<string>();
  const comps: GroupPlayer[][] = [];
  for (const p of mem) {
    if (seen.has(p.id)) continue;
    const comp: GroupPlayer[] = [];
    const queue = [p];
    seen.add(p.id);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const b of cur.buddyIds) {
        if (set.has(b) && !seen.has(b)) {
          seen.add(b);
          queue.push(byId.get(b)!);
        }
      }
    }
    comps.push(comp);
  }
  return comps;
}

// Post-process the first greedy pass. A bounded, deterministic hill-climb that
// applies the single best move/swap each round, but ONLY ones that never reduce
// total satisfaction (no met request is ever broken) and never worsen balance.
// This is the "keep going rather than one attempt" pass: it de-bloats teams that
// overshot target while open teams sit at the floor, and unites buddies stranded
// on separate teams when a safe move or an equal-size swap can do it. A locked
// team is never read-from or written-to.
function refine(teams: WorkingTeam[], target: number, w: Weights, locked: Set<string>): void {
  const movable = (p: GroupPlayer, wt: WorkingTeam) =>
    !locked.has(wt.team.id) &&
    !(p.coachId != null && wt.team.coachId === p.coachId); // a coach match / coach's kid is anchored

  const total = teams.reduce((a, t) => a + t.members.length, 0);
  const MAX_ROUNDS = total * 4 + 50; // converges well before this; a hard stop for safety

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const baseScore = teams.map((t) => teamScore(t.members, t.team.coachId, w));
    const basePen = teams.map((t) => penalty(t.members.length, target));

    let best: { gain: number; apply: () => void } | null = null;
    const consider = (gain: number, apply: () => void) => {
      if (gain > 1e-9 && (best === null || gain > best.gain)) best = { gain, apply };
    };

    // (a) Component moves — relocate a movable player OR a whole buddy-cluster as
    //     a unit to another team. Moving a single fill evens out sizes; moving a
    //     cluster together de-bloats an over-target team WITHOUT splitting the
    //     buddies that glue it (the common reason one team balloons). A unit is a
    //     connected component of movable members under buddy adjacency within src.
    for (let si = 0; si < teams.length; si++) {
      const src = teams[si];
      if (locked.has(src.team.id)) continue;
      for (const comp of movableComponents(src, movable)) {
        const compSet = new Set(comp.map((m) => m.id));
        const srcRest = src.members.filter((m) => !compSet.has(m.id));
        const srcScoreA = teamScore(srcRest, src.team.coachId, w);
        const srcPenA = penalty(srcRest.length, target);
        for (let di = 0; di < teams.length; di++) {
          if (di === si) continue;
          const dst = teams[di];
          if (locked.has(dst.team.id)) continue;
          const dstWith = dst.members.concat(comp);
          const dS = srcScoreA + teamScore(dstWith, dst.team.coachId, w) - baseScore[si] - baseScore[di];
          if (dS < -1e-9) continue; // would break a met request
          const dImb = srcPenA + penalty(dstWith.length, target) - basePen[si] - basePen[di];
          if (dImb > 1e-9) continue; // would worsen balance
          consider(dS - dImb, () => {
            src.members = srcRest;
            dst.members = dst.members.concat(comp);
          });
        }
      }
    }

    // (b) Targeted swaps — equal sizes, so balance-neutral. Unite a player with an
    //     unmet buddy, or put them on a night they're free, by trading with a
    //     movable player who loses nothing. Only destinations that can help are tried.
    for (let si = 0; si < teams.length; si++) {
      const src = teams[si];
      if (locked.has(src.team.id)) continue;
      const srcIds = new Set(src.members.map((m) => m.id));
      const srcNight = bestNight(src.members);
      for (const p of src.members) {
        if (!movable(p, src)) continue;
        const buddyUnmet = p.buddyIds.length > 0 && !p.buddyIds.some((b) => srcIds.has(b));
        const nightUnmet = p.nights.length > 0 && (!srcNight || !p.nights.includes(srcNight));
        if (!buddyUnmet && !nightUnmet) continue;
        for (let di = 0; di < teams.length; di++) {
          if (di === si) continue;
          const dst = teams[di];
          if (locked.has(dst.team.id)) continue;
          const dstIds = new Set(dst.members.map((m) => m.id));
          const helps =
            (buddyUnmet && p.buddyIds.some((b) => dstIds.has(b))) ||
            (nightUnmet && p.nights.includes(bestNight(dst.members) ?? ""));
          if (!helps) continue;
          for (const q of dst.members) {
            if (!movable(q, dst)) continue;
            const srcSwapped = src.members.map((m) => (m === p ? q : m));
            const dstSwapped = dst.members.map((m) => (m === q ? p : m));
            const dS =
              teamScore(srcSwapped, src.team.coachId, w) +
              teamScore(dstSwapped, dst.team.coachId, w) -
              baseScore[si] - baseScore[di];
            if (dS < 1e-9) continue; // a swap must strictly improve satisfaction
            consider(dS, () => {
              src.members = src.members.map((m) => (m === p ? q : m));
              dst.members = dst.members.map((m) => (m === q ? p : m));
            });
          }
        }
      }
    }

    if (best === null) break;
    (best as { gain: number; apply: () => void }).apply();
  }
}

// Assign every player into the FIXED set of input.teams. Pure & deterministic:
// same input → same output (no DB, no randomness, no Date.now). Every team in
// input.teams appears in the result — even empty placeholders — so they persist
// downstream.
export function assignDivision(input: AssignInput): AssignResult {
  const target = Math.max(1, Math.round(input.targetSize));

  // Working teams, in the caller's order so placeholders fill predictably.
  const teams: WorkingTeam[] = input.teams.map((team) => ({ team, members: [] }));

  // 1. coachId -> the team that coach runs. Authoritative teams carry coachId;
  //    placeholders don't. If two teams somehow share a coach the first wins
  //    (deterministic by caller order) — but normally a coach owns one team.
  const teamByCoach = new Map<string, WorkingTeam>();
  for (const wt of teams) {
    if (wt.team.coachId && !teamByCoach.has(wt.team.coachId)) {
      teamByCoach.set(wt.team.coachId, wt);
    }
  }

  // teamOf tracks where each already-placed player landed, so buddies can find them.
  const teamOf = new Map<string, WorkingTeam>();
  const place = (p: GroupPlayer, wt: WorkingTeam) => {
    wt.members.push(p);
    teamOf.set(p.id, wt);
  };

  // 2 + 3. Anchor every player who requested a coach that runs a real team onto
  //    that team — this covers both a protected coach's OWN kids (their coachId
  //    points at their parent's team and they ALWAYS land there) and ordinary
  //    requesters of that coach. Honoring the coach request beats hitting the
  //    target, so these anchors may exceed target — exactly the old "anchors may
  //    exceed target" rule. Everyone else is a free agent for now.
  //
  //    (input.protectedCoachIds doesn't change the placement here — a coach's
  //    kid is already routed by coachId — but a protected coach's team is, by
  //    virtue of holding those inviolable kids, one that can never be left
  //    empty/dropped. Since every team in input.teams is always emitted, that
  //    inviolability holds for free.)
  const free: GroupPlayer[] = [];
  for (const p of input.players) {
    const wt = p.coachId ? teamByCoach.get(p.coachId) : undefined;
    if (wt) place(p, wt);
    else free.push(p);
  }

  // 4. Buddies: pull a free agent onto a team already holding one of their
  //    requested buddies. Honoring a buddy is worth nudging a team a little over
  //    target (so a kid whose buddies are on a full team isn't stranded) — but
  //    NOT onto an already-oversized team. A popular coach can draw 21 requesters
  //    on his own; piling buddies on top ballooned one team to 29. Cap the
  //    buddy overflow so it stops well before that. Process in input order.
  const buddyCap = target + Math.max(2, Math.round(target / 4));
  const stillFree: GroupPlayer[] = [];
  for (const p of free) {
    let host: WorkingTeam | null = null;
    for (const bid of p.buddyIds) {
      const bt = teamOf.get(bid);
      if (bt && bt.members.length < buddyCap) {
        host = bt;
        break;
      }
    }
    if (host) place(p, host);
    else stillFree.push(p);
  }

  // 4b. Free agents who are buddies with EACH OTHER (none anchored to a coach)
  //     must land together. Find the connected components among the still-free
  //     players (buddy adjacency, restricted to still-free members) and seat
  //     each multi-member component as a UNIT into the team that keeps them
  //     together — preferring a team with room under target, then the best
  //     practice-night fit, then the fuller one (consolidate). Singletons fall
  //     through to the fill below.
  const stillFreeSet = new Set(stillFree.map((p) => p.id));
  const byId = new Map(stillFree.map((p) => [p.id, p]));
  const seenComp = new Set<string>();
  const singles: GroupPlayer[] = [];
  for (const p of stillFree) {
    if (seenComp.has(p.id)) continue;
    const comp: GroupPlayer[] = [];
    const queue = [p];
    seenComp.add(p.id);
    while (queue.length) {
      const cur = queue.shift()!;
      comp.push(cur);
      for (const bid of cur.buddyIds) {
        if (stillFreeSet.has(bid) && !seenComp.has(bid)) {
          seenComp.add(bid);
          queue.push(byId.get(bid)!);
        }
      }
    }
    if (comp.length === 1) {
      singles.push(comp[0]);
      continue;
    }
    // Seat the whole component into one team. Teams that fit the group under
    // target win decisively; among those, prefer the best practice-night fit,
    // then the fuller team (consolidate). If none fits under target, pick the
    // team that overflows the least.
    let best: WorkingTeam | null = null;
    let bestScore = -Infinity;
    for (const wt of teams) {
      const room = target - wt.members.length;
      const fits = room >= comp.length;
      const score =
        (fits ? 100 : 0) +
        nightFit(comp, wt) +
        (wt.members.length / target) * 0.5 -
        (fits ? 0 : comp.length - room);
      if (score > bestScore) {
        bestScore = score;
        best = wt;
      }
    }
    if (best) for (const m of comp) place(m, best);
  }

  // 5. Remaining free agents (singletons) fill open placeholders and any
  //    under-target coached teams toward the target. Practice-night fit leads
  //    (route a Thursday-only kid toward a Thursday-leaning team / a fresh open
  //    team rather than a Monday team); the FULLER team breaks ties to keep
  //    consolidating. Never push a team over target — UNLESS every team is
  //    already at/over target, in which case drop into the least-full team so
  //    nobody is left unassigned.
  //
  //    Viability floor: don't strand a coach with a near-empty team. While ANY
  //    team is still below minViable, a free agent may only land on a below-min
  //    team — so the small teams fill up before surplus kids get night-optimized
  //    onto already-viable ones. Night fit still leads within that restricted
  //    set (an empty placeholder is "open", so a Thursday kid can still start a
  //    Thursday team rather than be forced onto a Monday one).
  const minViable = Math.max(2, Math.floor(target / 2));
  for (const p of singles) {
    const needViable = teams.some((t) => t.members.length < minViable && t.members.length < target);
    let best: WorkingTeam | null = null;
    let bestScore = -Infinity;
    for (const wt of teams) {
      if (wt.members.length >= target) continue;
      if (needViable && wt.members.length >= minViable) continue; // phase 1: needy teams only
      // Night fit (0..2) dominates; fullness is a small consolidation tiebreak.
      const score = nightFit([p], wt) + (wt.members.length / target) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = wt;
      }
    }
    // Everyone at/over target → place into the least-full team so nobody drops.
    if (!best) {
      for (const wt of teams) {
        if (!best || wt.members.length < best.members.length) best = wt;
      }
    }
    if (best) place(p, best);
  }

  // 5b. Refinement: keep improving the first pass instead of stopping here. Only
  //    safe moves/swaps (never break a met request, never worsen balance) — this
  //    fixes over-target teams sitting next to floor-sized ones and unites stranded
  //    buddies. Locked teams are left exactly as they are.
  refine(teams, target, input.weights ?? DEFAULT_CONFIG.weights, input.lockedTeamIds ?? new Set());

  // 6 + 7. Emit EVERY team (empty placeholders included), each with its practice
  //    night chosen by member availability. Empty team → night null.
  const assignments: TeamAssignment[] = teams.map((wt) => ({
    teamId: wt.team.id,
    playerIds: wt.members.map((m) => m.id),
    night: wt.members.length > 0 ? bestNight(wt.members) : null,
  }));

  return { assignments };
}

// ── Flags for the board ──────────────────────────────────────────────────────
export type PlayerFlags = {
  coachUnmet: boolean; // requested a coach but isn't on that coach's team
  buddyUnmet: boolean; // none of their requested buddies are on their team
  nightUnmet: boolean; // not free on the team's practice night
};

export function flagsFor(
  player: GroupPlayer,
  team: { coachId: string | null; playerIds: string[]; night: string | null }
): PlayerFlags {
  const teamMates = new Set(team.playerIds);
  // Requested a coach (matched or not) but isn't on that coach's team. An
  // unmatched request (coach not on the roster) can never be on the right team,
  // so it always counts as unmet.
  const requestedCoach = player.coachReq ?? player.coachId != null;
  const coachUnmet = requestedCoach && !(player.coachId != null && team.coachId === player.coachId);
  const buddyUnmet =
    player.buddyIds.length > 0 && !player.buddyIds.some((id) => teamMates.has(id));
  const nightUnmet = team.night != null && !player.nights.includes(team.night);
  return { coachUnmet, buddyUnmet, nightUnmet };
}
