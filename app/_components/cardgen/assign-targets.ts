import type { AssignTarget } from "./CardEditor";

// Builds the Card Creator's "assign to a player" targets from raw player +
// roster rows, picking each player's current team (active entry preferred, else
// most recent) and carrying the details the editor auto-fills from.

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
  teams: { id: string; name: string; season: string | null; age_group: string | null } | null;
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

export function toAssignTargets(players: PlayerRow[], rosterRows: RosterRow[]): AssignTarget[] {
  const best = new Map<string, RosterRow>();
  for (const r of rosterRows) {
    if (!r.teams) continue;
    const cur = best.get(r.player_id);
    // Prefer an active roster entry; otherwise keep the most recent (first seen,
    // since callers order by created_at desc).
    if (!cur || r.status === "active") best.set(r.player_id, r);
  }

  return players
    .map((p) => {
      const r = best.get(p.id);
      return {
        id: p.id,
        name: `${p.first_name} ${p.last_name}`.trim(),
        firstName: p.first_name ?? "",
        lastName: p.last_name ?? "",
        teamId: r?.teams?.id ?? null,
        teamName: r?.teams?.name ?? null,
        season: r?.teams?.season ?? null,
        ageGroup: r?.teams?.age_group ?? null,
        jersey: r?.jersey_number != null ? String(r.jersey_number) : null,
        playerAge: ageFromDob(p.date_of_birth),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
