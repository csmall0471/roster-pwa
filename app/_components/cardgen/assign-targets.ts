import type { AssignTarget } from "./CardEditor";

// Builds the Card Creator's "assign to a player" targets from raw player +
// roster rows. A kid on multiple ACTIVE teams gets one target per team (so all
// their current teams appear in the picker). Players not on any active team are
// omitted entirely. Each carries the details the editor auto-fills from.

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
};

type RosterRow = {
  player_id: string;
  status: string;
  jersey_number: number | null;
  teams: {
    id: string;
    name: string;
    season: string | null;
    age_group: string | null;
    season_start: string | null;
    season_end: string | null;
  } | null;
};

function ageFromDob(dob: string | null): string {
  if (!dob) return "";
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : "";
}

// An "active" team = its season is currently in progress (started, not ended) —
// the same rule the Teams / Card Creator pages use. Teams without dates are
// treated as active so they're never hidden.
function isActiveTeam(start: string | null, end: string | null): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (end && end < today) return false;
  if (start && start > today) return false;
  return true;
}

export function toAssignTargets(players: PlayerRow[], rosterRows: RosterRow[]): AssignTarget[] {
  // Each player's CURRENT teams (one target per active team). De-duped by team.
  // Callers order rows by created_at desc, so the first row per team wins and
  // `mostRecent` holds the newest overall (used as a fallback below).
  const byPlayer = new Map<string, Map<string, RosterRow>>();
  for (const r of rosterRows) {
    if (!r.teams) continue;
    if (r.status !== "active") continue;
    if (!isActiveTeam(r.teams.season_start, r.teams.season_end)) continue; // active teams only
    let teams = byPlayer.get(r.player_id);
    if (!teams) byPlayer.set(r.player_id, (teams = new Map()));
    if (!teams.has(r.teams.id)) teams.set(r.teams.id, r);
  }

  const targets: AssignTarget[] = [];
  for (const p of players) {
    const name = `${p.first_name} ${p.last_name}`.trim();
    const base = {
      id: p.id,
      name,
      firstName: p.first_name ?? "",
      lastName: p.last_name ?? "",
      playerAge: ageFromDob(p.date_of_birth),
    };
    const teams = byPlayer.get(p.id);
    // Only players on an active team belong in the picker — skip everyone else
    // (no active-status roster row on an in-progress team).
    if (!teams || teams.size === 0) continue;
    for (const r of teams.values()) {
      targets.push({
        ...base,
        key: `${p.id}::${r.teams!.id}`,
        teamId: r.teams!.id,
        teamName: r.teams!.name,
        season: r.teams!.season ?? null,
        ageGroup: r.teams!.age_group ?? null,
        jersey: r.jersey_number != null ? String(r.jersey_number) : null,
      });
    }
  }

  // Group a kid's teams together, alphabetical by name then team.
  return targets.sort(
    (a, b) => a.name.localeCompare(b.name) || (a.teamName ?? "").localeCompare(b.teamName ?? "")
  );
}
