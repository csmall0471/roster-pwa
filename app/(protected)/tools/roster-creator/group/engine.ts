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
  //    buddies — but only if that team is still under target (a buddy request
  //    doesn't justify going over). Process in input order for determinism.
  const stillFree: GroupPlayer[] = [];
  for (const p of free) {
    let host: WorkingTeam | null = null;
    for (const bid of p.buddyIds) {
      const bt = teamOf.get(bid);
      if (bt && bt.members.length < target) {
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
  const coachUnmet = player.coachId != null && team.coachId !== player.coachId;
  const buddyUnmet =
    player.buddyIds.length > 0 && !player.buddyIds.some((id) => teamMates.has(id));
  const nightUnmet = team.night != null && !player.nights.includes(team.night);
  return { coachUnmet, buddyUnmet, nightUnmet };
}
