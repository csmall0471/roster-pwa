// Per-division grouping engine. Pure and deterministic — no DB, no API.
// Seeds teams from the strongest resolved signals (requested team name, then
// coach), keeps buddies together, fills toward a TARGET size, then picks each
// team's practice night by member availability. A team only exceeds the target
// to keep a coach/team's requesters together — free agents never push it over.

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

export type GroupedTeam = {
  coachId: string | null;
  teamNameId: string | null;
  playerIds: string[];
  night: string | null;
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

type WorkingTeam = {
  coachId: string | null;
  teamNameId: string | null;
  members: GroupPlayer[];
};

export function groupDivision(
  players: GroupPlayer[],
  config: GroupConfig,
  // Coaches who have their OWN child enrolled in this division. Their team is
  // real and inviolable: the coach's kids anchor by coach (not team name) and
  // the team is never merged away. "A coach's children are always on their
  // parent's team — no exception."
  protectedCoachIds: Set<string> = new Set()
): GroupedTeam[] {
  if (players.length === 0) return [];
  const target = Math.max(1, Math.round(config.target));
  const byId = new Map(players.map((p) => [p.id, p]));
  const isProtected = (t: { coachId: string | null }) => !!t.coachId && protectedCoachIds.has(t.coachId);

  // 1. Seed "anchored" teams by the strongest identity. Normally the requested
  //    team name wins, else the coach. But for a protected coach (their own kid
  //    is here) the COACH wins so all their kids land on the one real team,
  //    even if some families also typed a team name. These anchors hold all
  //    their requesters together and may exceed the target — the only allowed
  //    reason to go over.
  const keyOf = (p: GroupPlayer) =>
    p.coachId && protectedCoachIds.has(p.coachId)
      ? `C:${p.coachId}`
      : p.teamNameId
      ? `T:${p.teamNameId}`
      : p.coachId
      ? `C:${p.coachId}`
      : null;

  const seeds = new Map<string, WorkingTeam>();
  const free: GroupPlayer[] = [];
  for (const p of players) {
    const k = keyOf(p);
    if (!k) {
      free.push(p);
      continue;
    }
    if (!seeds.has(k)) seeds.set(k, { coachId: p.coachId, teamNameId: p.teamNameId, members: [] });
    seeds.get(k)!.members.push(p);
  }
  const teams: WorkingTeam[] = [...seeds.values()];
  const teamIndexOf = new Map<string, number>();
  teams.forEach((t, i) => t.members.forEach((m) => teamIndexOf.set(m.id, i)));

  // 2. Pull free agents onto a team holding one of their buddies — but only if
  //    that team is still under target (a buddy request doesn't justify going over).
  const stillFree: GroupPlayer[] = [];
  for (const p of free) {
    const ti = p.buddyIds.map((id) => teamIndexOf.get(id)).find((i) => i != null);
    if (ti != null && teams[ti].members.length < target) {
      teams[ti].members.push(p);
      teamIndexOf.set(p.id, ti);
    } else {
      stillFree.push(p);
    }
  }

  // 3. Free agents who are buddies with each other form their own teams.
  const seen = new Set<string>();
  for (const p of stillFree) {
    if (seen.has(p.id)) continue;
    const component: GroupPlayer[] = [];
    const queue = [p];
    seen.add(p.id);
    while (queue.length) {
      const cur = queue.shift()!;
      component.push(cur);
      for (const bid of cur.buddyIds) {
        const b = byId.get(bid);
        if (b && !seen.has(bid) && stillFree.includes(b)) {
          seen.add(bid);
          queue.push(b);
        }
      }
    }
    if (component.length > 1) {
      teams.push({ coachId: null, teamNameId: null, members: component });
    }
  }
  const trulyFree = stillFree.filter((p) => !teams.some((t) => t.members.includes(p)));

  // 4. Fill remaining free agents toward the target, NEVER pushing a team over
  //    it. Prefer fuller teams (consolidate) and a matching practice night.
  for (const p of trulyFree) {
    let bestTeam: WorkingTeam | null = null;
    let bestScore = -Infinity;
    for (const t of teams) {
      if (t.members.length >= target) continue;
      const night = bestNight(t.members);
      const nightScore = night && p.nights.includes(night) ? config.weights.night : 0;
      const score = nightScore + t.members.length / target; // fuller-first + night fit
      if (score > bestScore) {
        bestScore = score;
        bestTeam = t;
      }
    }
    if (bestTeam) bestTeam.members.push(p);
    else teams.push({ coachId: null, teamNameId: null, members: [p] });
  }

  // 5. Consolidate only the teams too small to be real (a coach requested by a
  //    single family shouldn't be a team of one). Teams at/above the viability
  //    floor are kept as-is — honoring the coach request matters more than
  //    hitting the target exactly. Tiny teams merge into the fullest team they
  //    fit in without exceeding the target.
  const minViable = Math.max(2, Math.floor(target / 2));
  teams.sort((a, b) => a.members.length - b.members.length);
  const merged: WorkingTeam[] = [];
  for (const t of teams) {
    // A protected coach's team is real no matter how small — never fold it away.
    if (t.members.length >= minViable || isProtected(t)) {
      merged.push(t);
      continue;
    }
    const host = merged
      .filter((m) => m.members.length < target && m.members.length + t.members.length <= target)
      .sort((a, b) => b.members.length - a.members.length)[0];
    if (host) {
      host.members.push(...t.members);
      host.coachId = host.coachId ?? t.coachId;
      host.teamNameId = host.teamNameId ?? t.teamNameId;
    } else {
      merged.push(t);
    }
  }

  // 6. Finalize: choose each team's practice night.
  return merged
    .filter((t) => t.members.length > 0)
    .map((t) => ({
      coachId: t.coachId,
      teamNameId: t.teamNameId,
      playerIds: t.members.map((m) => m.id),
      night: bestNight(t.members),
    }));
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
