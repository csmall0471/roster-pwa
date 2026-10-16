// Pure auto-assign engine for the Seating tool. No I/O, no clock, no
// Math.random — every tie-break comes from a seeded PRNG, so the same input +
// seed always reproduces the same layout and a new seed visibly reshuffles
// ("Re-run"). Pipeline:
//
//   1. Weigh every pair of kids: sit-by picks, siblings, shared teams.
//   2. Merge kids into friend groups of at most 4 (one seat cluster) by
//      union-find over the edges, strongest first.
//   3. Bucket seats into clusters — one per zone, loose seats merged by
//      proximity — ordered by the plan's zone fill preference.
//   4. Place groups biggest-first into the best-scoring cluster (friend pull,
//      spare-seat penalty); a group that fits nowhere splits at its weakest
//      link and both halves re-queue.
//   5. Arrange each group on specific seats so the strongest pairs are
//      physically adjacent, then seat leftover singles one seat at a time.

import type { AssignInput, AssignResult } from "./types";
import { SEAT } from "./layout-seed";

// ── Tunables ─────────────────────────────────────────────────────────────────
const MAX_GROUP = 4; // friend groups never outgrow one 4-seat cluster
const LOOSE_JOIN = SEAT * 2; // loose seats within this distance form a cluster
const ADJ = 95; // "adjacent seats": centers within ~1.3 × seat pitch (72px)
const PULL_SCALE = 400; // px falloff for the pull toward already-placed friends
const SPARE_PENALTY = 0.3; // per leftover seat, so small groups avoid big clusters
const BRUTE_MAX = 5040; // max seat arrangements to try exhaustively (= 7!)

// Pair weights — summed when several apply. A mutual pick replaces (does not
// stack on) the one-way weight; team overlap counts once however many teams.
const W_MUTUAL = 3.0;
const W_ONEWAY = 2.0;
const W_FAMILY = 2.5;
const W_TEAM = 0.5;

// ── Small helpers ────────────────────────────────────────────────────────────
type Rng = () => number;

// mulberry32: tiny 32-bit seeded PRNG — plenty for tie-breaking.
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Minimal union-find (friend groups + loose-seat proximity clustering).
class DSU {
  private parent: number[];
  readonly size: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.size = Array.from({ length: n }, () => 1);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]];
      i = this.parent[i];
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    this.parent[rb] = ra;
    this.size[ra] += this.size[rb];
  }
}

const dist = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(ax - bx, ay - by);

// Arrangement quality for one pair: full credit when adjacent (within ADJ,
// which doubles as the pick-satisfaction radius), distance decay otherwise.
const pairScore = (w: number, d: number): number =>
  d <= ADJ ? w : (w * 0.4) / (1 + d / ADJ);

type SeatIn = AssignInput["seats"][number];

type Cluster = {
  seats: SeatIn[]; // all assignable seats of the cluster (input order)
  free: SeatIn[]; // not yet assigned this run (mutated during placement)
  cx: number; // centroid of all seats
  cy: number;
};

type Group = { members: number[]; jitter: number };

// ── Engine ───────────────────────────────────────────────────────────────────
export function autoAssign(input: AssignInput, seed: number): AssignResult {
  const rng = mulberry32(seed);

  // Stage 0 — index people (dropping duplicate ids defensively).
  const people: AssignInput["people"] = [];
  const idx = new Map<string, number>();
  for (const p of input.people) {
    if (!idx.has(p.personId)) {
      idx.set(p.personId, people.length);
      people.push(p);
    }
  }
  const n = people.length;

  // Dedupe directed picks and drop self-picks. Metric choice (documented per
  // the contract): totalPicks counts deduped directed edges whose `from` is in
  // the people set — the kid who asked is on this plan. The `to` side may be
  // absent (not pulled in / locked / said no); such a pick stays in the
  // denominator but can never be satisfied.
  const seenPick = new Set<string>();
  const picks: { from: string; to: string }[] = [];
  for (const e of input.pickEdges) {
    const key = `${e.from}\u0000${e.to}`;
    if (e.from === e.to || seenPick.has(key)) continue;
    seenPick.add(key);
    picks.push(e);
  }
  const counted = picks.filter((e) => idx.has(e.from));
  const totalPicks = counted.length;

  // Stage 1 — pairwise weights. Directed pick lookup first (index space).
  const pickSet = new Set<string>();
  for (const e of picks) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a !== undefined && b !== undefined) pickSet.add(`${a}\u0000${b}`);
  }
  const teamSets = people.map((p) => new Set(p.teamIds));
  const wByPair = new Map<number, number>(); // key a*n+b with a < b
  const neighbors: { j: number; w: number }[][] = Array.from({ length: n }, () => []);
  const edges: { a: number; b: number; w: number; jitter: number }[] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const ab = pickSet.has(`${a}\u0000${b}`);
      const ba = pickSet.has(`${b}\u0000${a}`);
      let w = ab && ba ? W_MUTUAL : ab || ba ? W_ONEWAY : 0;
      if (people[a].familyKey !== null && people[a].familyKey === people[b].familyKey)
        w += W_FAMILY;
      if (people[a].teamIds.some((t) => teamSets[b].has(t))) w += W_TEAM;
      if (w > 0) {
        wByPair.set(a * n + b, w);
        neighbors[a].push({ j: b, w });
        neighbors[b].push({ j: a, w });
        edges.push({ a, b, w, jitter: rng() });
      }
    }
  }
  const wOf = (a: number, b: number): number =>
    wByPair.get(a < b ? a * n + b : b * n + a) ?? 0;

  // Stage 2 — friend groups: greedy strongest-first merging, capped at 4.
  edges.sort((x, y) => y.w - x.w || x.jitter - y.jitter);
  const dsu = new DSU(n);
  for (const e of edges) {
    const ra = dsu.find(e.a);
    const rb = dsu.find(e.b);
    if (ra !== rb && dsu.size[ra] + dsu.size[rb] <= MAX_GROUP) dsu.union(ra, rb);
  }
  const byRoot = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const r = dsu.find(i);
    const list = byRoot.get(r);
    if (list) list.push(i);
    else byRoot.set(r, [i]);
  }

  // Stage 3 — seat clusters: one per zone; loose seats merge within 2×SEAT.
  const zoneSeats = new Map<string, SeatIn[]>();
  const loose: SeatIn[] = [];
  for (const s of input.seats) {
    if (s.zoneId === null) {
      loose.push(s);
      continue;
    }
    const list = zoneSeats.get(s.zoneId);
    if (list) list.push(s);
    else zoneSeats.set(s.zoneId, [s]);
  }
  const looseDsu = new DSU(loose.length);
  for (let i = 0; i < loose.length; i++)
    for (let j = i + 1; j < loose.length; j++)
      if (dist(loose[i].cx, loose[i].cy, loose[j].cx, loose[j].cy) <= LOOSE_JOIN)
        looseDsu.union(i, j);
  const looseGroups = new Map<number, SeatIn[]>();
  for (let i = 0; i < loose.length; i++) {
    const r = looseDsu.find(i);
    const list = looseGroups.get(r);
    if (list) list.push(loose[i]);
    else looseGroups.set(r, [loose[i]]);
  }
  const mkCluster = (seats: SeatIn[]): Cluster => ({
    seats,
    free: [...seats],
    cx: seats.reduce((s, x) => s + x.cx, 0) / seats.length,
    cy: seats.reduce((s, x) => s + x.cy, 0) / seats.length,
  });
  // Fill order: zoneOrder rank (unknown zones and loose clusters last), then
  // first-seat position in reading order. This fixes enumeration order, so
  // score ties fall to the PRNG rather than to input shuffling.
  const orderIdx = new Map(input.zoneOrder.map((z, i) => [z, i]));
  const rankOf = (c: Cluster): number => {
    const z = c.seats[0].zoneId;
    if (z === null) return Number.MAX_SAFE_INTEGER;
    return orderIdx.get(z) ?? Number.MAX_SAFE_INTEGER;
  };
  const clusters = [
    ...[...zoneSeats.values()].map(mkCluster),
    ...[...looseGroups.values()].map(mkCluster),
  ].sort(
    (c1, c2) =>
      rankOf(c1) - rankOf(c2) ||
      c1.seats[0].cy - c2.seats[0].cy ||
      c1.seats[0].cx - c2.seats[0].cx
  );

  // Placement state.
  const seatByPerson: Record<string, string> = {};
  const unplaced: string[] = [];
  const posOf = new Map<number, { x: number; y: number }>(); // person → seat center
  const clusterOf = new Map<number, number>(); // person → cluster index
  const commit = (member: number, seat: SeatIn, ci: number): void => {
    seatByPerson[people[member].personId] = seat.id;
    posOf.set(member, { x: seat.cx, y: seat.cy });
    clusterOf.set(member, ci);
    clusters[ci].free.splice(clusters[ci].free.indexOf(seat), 1);
  };

  // Stage 5 helper — within-cluster arrangement: strongest pairs adjacent.
  // Exhaustive over all injective member→seat mappings when the space is
  // small (≤ BRUTE_MAX), greedy attachment otherwise.
  const arrange = (members: number[], ci: number): void => {
    const free = [...clusters[ci].free]; // snapshot; commit() mutates the live list
    const k = members.length;
    // Internal edges in member-index space, strongest first (PRNG tie-break).
    const internal: { ia: number; ib: number; w: number; jitter: number }[] = [];
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) {
        const w = wOf(members[i], members[j]);
        if (w > 0) internal.push({ ia: i, ib: j, w, jitter: rng() });
      }
    internal.sort((x, y) => y.w - x.w || x.jitter - y.jitter);

    let perms = 1;
    for (let t = 0; t < k; t++) perms *= free.length - t;

    const chosen = new Array<SeatIn | null>(k).fill(null);
    if (perms <= BRUTE_MAX) {
      // Brute force: score every arrangement, keep the argmax (PRNG tie-break).
      const sel = new Array<number>(k).fill(-1);
      const used = new Array<boolean>(free.length).fill(false);
      let best: number[] = [];
      let bestScore = -Infinity;
      let bestJitter = -1;
      const recurse = (t: number): void => {
        if (t === k) {
          let score = 0;
          for (const e of internal) {
            const sa = free[sel[e.ia]];
            const sb = free[sel[e.ib]];
            score += pairScore(e.w, dist(sa.cx, sa.cy, sb.cx, sb.cy));
          }
          const j = rng();
          if (score > bestScore || (score === bestScore && j > bestJitter)) {
            bestScore = score;
            bestJitter = j;
            best = [...sel];
          }
          return;
        }
        for (let f = 0; f < free.length; f++) {
          if (used[f]) continue;
          used[f] = true;
          sel[t] = f;
          recurse(t + 1);
          used[f] = false;
        }
      };
      recurse(0);
      best.forEach((f, t) => {
        chosen[t] = free[f];
      });
    } else {
      // Greedy: strongest pair takes the tightest seat pair, then each next
      // member (most bonded to the seated first) takes its best seat.
      const freeLeft = new Set<number>(free.map((_, f) => f));
      const seated: number[] = []; // member indices already given a seat
      const strongest = internal[0];
      if (strongest !== undefined) {
        let bp: [number, number] = [0, 1];
        let bd = Infinity;
        let bj = -1;
        for (let f1 = 0; f1 < free.length; f1++)
          for (let f2 = f1 + 1; f2 < free.length; f2++) {
            const d = dist(free[f1].cx, free[f1].cy, free[f2].cx, free[f2].cy);
            const j = rng();
            if (d < bd || (d === bd && j > bj)) {
              bd = d;
              bj = j;
              bp = [f1, f2];
            }
          }
        chosen[strongest.ia] = free[bp[0]];
        chosen[strongest.ib] = free[bp[1]];
        freeLeft.delete(bp[0]);
        freeLeft.delete(bp[1]);
        seated.push(strongest.ia, strongest.ib);
      }
      while (seated.length < k) {
        // Next member: strongest single bond to anyone already seated.
        let pick = -1;
        let pickW = -1;
        let pickJ = -1;
        for (let t = 0; t < k; t++) {
          if (chosen[t] !== null) continue;
          let wMax = 0;
          for (const t2 of seated) wMax = Math.max(wMax, wOf(members[t], members[t2]));
          const j = rng();
          if (wMax > pickW || (wMax === pickW && j > pickJ)) {
            pick = t;
            pickW = wMax;
            pickJ = j;
          }
        }
        // Its best seat: maximize pair score against all seated members.
        let bf = -1;
        let bs = -Infinity;
        let bj = -1;
        for (const f of freeLeft) {
          let s = 0;
          for (const t2 of seated) {
            const seat2 = chosen[t2];
            if (seat2)
              s += pairScore(
                wOf(members[pick], members[t2]),
                dist(free[f].cx, free[f].cy, seat2.cx, seat2.cy)
              );
          }
          const j = rng();
          if (s > bs || (s === bs && j > bj)) {
            bf = f;
            bs = s;
            bj = j;
          }
        }
        chosen[pick] = free[bf];
        freeLeft.delete(bf);
        seated.push(pick);
      }
    }
    chosen.forEach((seat, t) => {
      if (seat) commit(members[t], seat, ci);
    });
  };

  // Stage 4 helper — split a group at its weakest link: rebuild its maximum
  // spanning tree (edges are already strongest-first) and cut the weakest
  // (last-added) tree edge; the two components become the halves.
  const splitGroup = (members: number[]): [number[], number[]] => {
    const pos = new Map(members.map((m, i) => [m, i]));
    const local = new DSU(members.length);
    const tree: { a: number; b: number }[] = [];
    for (const e of edges) {
      const pa = pos.get(e.a);
      const pb = pos.get(e.b);
      if (pa === undefined || pb === undefined) continue;
      if (local.find(pa) !== local.find(pb)) {
        local.union(pa, pb);
        tree.push({ a: pa, b: pb });
        if (tree.length === members.length - 1) break;
      }
    }
    const cut = tree.pop();
    if (cut === undefined) return [members.slice(0, 1), members.slice(1)]; // defensive
    const halves = new DSU(members.length);
    for (const t of tree) halves.union(t.a, t.b);
    const rootA = halves.find(cut.a);
    const h1: number[] = [];
    const h2: number[] = [];
    for (let i = 0; i < members.length; i++)
      (halves.find(i) === rootA ? h1 : h2).push(members[i]);
    return [h1, h2];
  };

  // Stage 4 — place groups biggest-first; singles are deferred to stage 5.
  const queue: Group[] = [...byRoot.values()].map((members) => ({ members, jitter: rng() }));
  const sortQueue = (): void => {
    queue.sort((g1, g2) => g2.members.length - g1.members.length || g1.jitter - g2.jitter);
  };
  const singles: number[] = [];
  sortQueue();
  for (let g = queue.shift(); g !== undefined; g = queue.shift()) {
    if (g.members.length === 1) {
      singles.push(g.members[0]);
      continue;
    }
    const k = g.members.length;
    // Co-locating the whole group satisfies every internal edge — a constant
    // across candidate clusters, kept in the score per the spec.
    let inner = 0;
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) inner += wOf(g.members[i], g.members[j]);
    let bestCi = -1;
    let bestScore = -Infinity;
    let bestJitter = -1;
    for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci];
      if (c.free.length < k) continue;
      let score = inner - SPARE_PENALTY * (c.free.length - k);
      // Pull toward friends already seated elsewhere, decaying with distance.
      for (const m of g.members)
        for (const nb of neighbors[m]) {
          const p = posOf.get(nb.j);
          if (p) score += nb.w / (1 + dist(c.cx, c.cy, p.x, p.y) / PULL_SCALE);
        }
      const j = rng();
      if (score > bestScore || (score === bestScore && j > bestJitter)) {
        bestCi = ci;
        bestScore = score;
        bestJitter = j;
      }
    }
    if (bestCi >= 0) {
      arrange(g.members, bestCi);
    } else {
      const [h1, h2] = splitGroup(g.members);
      queue.push({ members: h1, jitter: rng() }, { members: h2, jitter: rng() });
      sortQueue();
    }
  }

  // Stage 5 — singles pass, best-connected first (so when seats run out, the
  // least-connected people are the ones left unplaced).
  const singleOrder = singles
    .map((m) => ({
      m,
      conn: neighbors[m].reduce((s, nb) => s + nb.w, 0),
      jitter: rng(),
    }))
    .sort((x, y) => y.conn - x.conn || x.jitter - y.jitter);
  for (const { m } of singleOrder) {
    let bestSeat: SeatIn | null = null;
    let bestCi = -1;
    let bestScore = -Infinity;
    let bestJitter = -1;
    for (let ci = 0; ci < clusters.length; ci++) {
      const c = clusters[ci];
      if (c.free.length === 0) continue;
      // Weight to people already seated in this cluster (same for every seat
      // of the cluster) …
      let clusterW = 0;
      for (const nb of neighbors[m]) if (clusterOf.get(nb.j) === ci) clusterW += nb.w;
      for (const seat of c.free) {
        // … plus the strongest single-friend pull from this exact seat.
        let pull = 0;
        for (const nb of neighbors[m]) {
          const p = posOf.get(nb.j);
          if (p) pull = Math.max(pull, nb.w / (1 + dist(seat.cx, seat.cy, p.x, p.y) / PULL_SCALE));
        }
        const score = clusterW + pull;
        const j = rng();
        if (score > bestScore || (score === bestScore && j > bestJitter)) {
          bestSeat = seat;
          bestCi = ci;
          bestScore = score;
          bestJitter = j;
        }
      }
    }
    if (bestSeat !== null && bestCi >= 0) commit(m, bestSeat, bestCi);
    else unplaced.push(people[m].personId);
  }

  // Metrics — a directed pick is satisfied when both kids got seats in the
  // same cluster, or on adjacent seats across cluster lines.
  let satisfiedPicks = 0;
  for (const e of counted) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a === undefined || b === undefined) continue;
    const pa = posOf.get(a);
    const pb = posOf.get(b);
    if (!pa || !pb) continue;
    if (clusterOf.get(a) === clusterOf.get(b) || dist(pa.x, pa.y, pb.x, pb.y) <= ADJ)
      satisfiedPicks++;
  }

  return { seatByPerson, unplaced, satisfiedPicks, totalPicks };
}
