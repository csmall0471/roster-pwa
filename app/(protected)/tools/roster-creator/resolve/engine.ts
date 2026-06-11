import { type CanonicalRecord, isNoRequest } from "../fields";
import { clusterStrings, type Cluster } from "./cluster";
import {
  parseBuddyCell,
  matchBuddy,
  type BuddyMatch,
  type RosterName,
} from "./buddies";
import { crossDivisionFlag, type CrossDivisionFlag } from "./hints";

export type ResolveResult = {
  coachClusters: Cluster[];
  teamClusters: Cluster[];
  buddyMatches: BuddyMatch[];
  crossDivisionFlags: CrossDivisionFlag[];
};

function coachName(r: CanonicalRecord): string {
  const parts = [r.coach_first, r.coach_last].filter((p) => p && !isNoRequest(p));
  return parts.join(" ").trim();
}

// Run the deterministic ("fuzzy-first") resolution pass over a roster. This is
// the cheap layer; ambiguous results (low-confidence buddies, near-threshold
// clusters) are what a later Claude pass refines.
export function resolveRoster(records: CanonicalRecord[]): ResolveResult {
  const coachInputs = records
    .map((r, id) => ({ id, value: coachName(r) }))
    .filter((x) => x.value);
  const teamInputs = records
    .map((r, id) => ({ id, value: r.team_name }))
    .filter((x) => x.value && !isNoRequest(x.value));

  const roster: RosterName[] = records.map((r, index) => ({
    index,
    first: r.first_name,
    last: r.last_name,
  }));

  const buddyMatches: BuddyMatch[] = [];
  records.forEach((r, fromIndex) => {
    for (const cand of parseBuddyCell(r.buddy_first, r.buddy_last)) {
      const { index, score } = matchBuddy(cand.name, roster, fromIndex);
      buddyMatches.push({
        fromIndex,
        rawName: cand.name,
        toIndex: index,
        score,
        confidence: cand.confidence,
      });
    }
  });

  const crossDivisionFlags: CrossDivisionFlag[] = [];
  records.forEach((r, i) => {
    const flag = crossDivisionFlag(i, r.package_name, r.team_name, coachName(r));
    if (flag) crossDivisionFlags.push(flag);
  });

  return {
    coachClusters: clusterStrings(coachInputs),
    teamClusters: clusterStrings(teamInputs),
    buddyMatches,
    crossDivisionFlags,
  };
}

// ── Display-ready proposal keyed by real player IDs ──────────────────────────
// Wraps resolveRoster, mapping row indices back to persistent player ids/names
// so the review UI and the apply step can work with stable identifiers.

export type PlayerInput = { id: string; record: CanonicalRecord };

export type EntityProposal = {
  canonical: string;
  variants: string[];
  playerIds: string[];
  confidence: "high" | "review";
};

export type BuddyProposal = {
  fromId: string;
  fromName: string;
  toId: string | null;
  toName: string | null;
  rawName: string;
  score: number;
  confidence: "high" | "low";
  reciprocal: boolean;
};

export type CrossFlagProposal = {
  playerId: string;
  name: string;
  enrolledAge: number | null;
  hintedAge: number;
  source: string;
};

export type Proposal = {
  coaches: EntityProposal[];
  teams: EntityProposal[];
  buddies: BuddyProposal[];
  crossFlags: CrossFlagProposal[];
};

export function buildProposal(players: PlayerInput[]): Proposal {
  const records = players.map((p) => p.record);
  const res = resolveRoster(records);

  const idOf = (index: number) => players[index].id;
  const nameOf = (index: number) =>
    `${records[index].first_name} ${records[index].last_name}`.trim();

  // For reciprocity: which (from→to) index pairs exist among resolved matches.
  const directed = new Set(
    res.buddyMatches
      .filter((m) => m.toIndex !== null)
      .map((m) => `${m.fromIndex}->${m.toIndex}`)
  );

  const toEntity = (c: { canonical: string; variants: string[]; ids: number[]; confidence: "high" | "review" }): EntityProposal => ({
    canonical: c.canonical,
    variants: c.variants,
    playerIds: c.ids.map(idOf),
    confidence: c.confidence,
  });

  return {
    coaches: res.coachClusters.map(toEntity),
    teams: res.teamClusters.map(toEntity),
    buddies: res.buddyMatches.map((m) => ({
      fromId: idOf(m.fromIndex),
      fromName: nameOf(m.fromIndex),
      toId: m.toIndex === null ? null : idOf(m.toIndex),
      toName: m.toIndex === null ? null : nameOf(m.toIndex),
      rawName: m.rawName,
      score: m.score,
      confidence: m.confidence,
      reciprocal: m.toIndex !== null && directed.has(`${m.toIndex}->${m.fromIndex}`),
    })),
    crossFlags: res.crossDivisionFlags.map((f) => ({
      playerId: idOf(f.playerIndex),
      name: nameOf(f.playerIndex),
      enrolledAge: f.enrolledAge,
      hintedAge: f.hintedAge,
      source: f.source,
    })),
  };
}
