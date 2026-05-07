import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { Team } from "@/lib/types";
import DeleteTeamButton from "./_components/DeleteTeamButton";
import DuplicateTeamButton from "./_components/DuplicateTeamButton";

function formatDateRange(start: string | null, end: string | null): string {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return "";
}

function classify(team: Team, today: string): "upcoming" | "current" | "previous" {
  const { season_start, season_end } = team;
  if (season_end && season_end < today) return "previous";
  if (season_start && season_start > today) return "upcoming";
  return "current";
}

function TeamList({ teams }: { teams: Team[] }) {
  return (
    <ul className="space-y-3">
      {teams.map((team) => {
        const meta = [team.organization, team.sport, team.age_group, team.season]
          .filter(Boolean)
          .join(" · ");
        const dateRange = formatDateRange(team.season_start, team.season_end);

        return (
          <li
            key={team.id}
            className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 px-5 py-4 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <Link
                href={`/teams/${team.id}`}
                className="font-semibold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 truncate block"
              >
                {team.name}
              </Link>
              {meta && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{meta}</p>
              )}
              {dateRange && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dateRange}</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 text-sm">
              <Link href={`/teams/${team.id}`} className="text-blue-600 hover:underline">
                Roster
              </Link>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <Link href={`/teams/${team.id}/edit`} className="text-blue-600 hover:underline">
                Edit
              </Link>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <DuplicateTeamButton id={team.id} />
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <DeleteTeamButton id={team.id} name={team.name} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export default async function TeamsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teams")
    .select("*")
    .order("season_start", { ascending: false });

  const teams = (data ?? []) as Team[];

  // today as YYYY-MM-DD for simple string comparison with date columns
  const today = new Date().toISOString().slice(0, 10);

  const upcoming = teams.filter((t) => classify(t, today) === "upcoming")
    .sort((a, b) => (a.season_start ?? "").localeCompare(b.season_start ?? "")); // soonest first
  const current  = teams.filter((t) => classify(t, today) === "current");
  const previous = teams.filter((t) => classify(t, today) === "previous");

  const isEmpty = teams.length === 0;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Teams</h1>
        <Link
          href="/teams/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
        >
          + New team
        </Link>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3 mb-4">{error.message}</p>
      )}

      {isEmpty ? (
        <div className="text-center py-16 text-gray-500 dark:text-gray-400">
          <p className="text-lg font-medium mb-1">No teams yet</p>
          <p className="text-sm">Create your first team to get started.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Upcoming
              </h2>
              <TeamList teams={upcoming} />
            </section>
          )}

          {current.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                Current
              </h2>
              <TeamList teams={current} />
            </section>
          )}

          {previous.length > 0 && (() => {
            const byYear = new Map<string, Team[]>();
            for (const t of previous) {
              const year = t.season_end?.slice(0, 4) ?? t.season_start?.slice(0, 4) ?? "Unknown";
              if (!byYear.has(year)) byYear.set(year, []);
              byYear.get(year)!.push(t);
            }
            const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
            return (
              <section>
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
                  Previous
                </h2>
                <div className="opacity-70 space-y-5">
                  {years.map((year) => (
                    <div key={year}>
                      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 pl-1">{year}</p>
                      <TeamList teams={byYear.get(year)!} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })()}
        </div>
      )}
    </div>
  );
}
