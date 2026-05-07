import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function formatDateRange(start: string | null, end: string | null) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return null;
}

export default async function ParentTeamPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) redirect("/login");

  // Get this parent's kid IDs so we can highlight them in the roster
  const { data: ppRows } = await supabase
    .from("player_parents")
    .select("player_id")
    .eq("parent_id", parentLink.parent_id);
  const myKidIds = new Set((ppRows ?? []).map((r) => r.player_id));

  // Fetch team info (existing parents_read_teams policy allows this)
  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .single();
  if (!team) notFound();

  // Fetch full roster via SECURITY DEFINER function (verifies parent has kid on team)
  const { data: roster } = await supabase.rpc("get_team_roster_for_parent", {
    p_team_id: id,
  });
  if (!roster) notFound(); // returns null if parent has no kid on this team

  type RosterEntry = { player_id: string; first_name: string; last_name: string; jersey_number: number | null; status: string };
  const active = (roster ?? []).filter((r: RosterEntry) => r.status === "active");
  const inactive = (roster ?? []).filter((r: RosterEntry) => r.status === "inactive");

  const meta = [team.organization, team.sport, team.age_group, team.season]
    .filter(Boolean).join(" · ");
  const dateRange = formatDateRange(team.season_start, team.season_end);

  return (
    <div>
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      {/* Header */}
      <div className="mt-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{team.name}</h1>
        {meta && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{meta}</p>}
        {dateRange && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{dateRange}</p>}

        {/* External links */}
        {(team.mojo_code || team.snack_signup_url) && (
          <div className="flex gap-2 mt-3 flex-wrap">
            {team.snack_signup_url && (
              <a
                href={team.snack_signup_url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-green-300 dark:border-green-700 px-3 py-1.5 text-sm font-medium text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950 transition-colors"
              >
                Snack signup →
              </a>
            )}
            {team.mojo_code && (
              <a
                href={`https://get.mojo.sport/team-invite?code=${team.mojo_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-orange-300 dark:border-orange-700 px-3 py-1.5 text-sm font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950 transition-colors"
              >
                Join on Mojo →
              </a>
            )}
          </div>
        )}
      </div>

      {/* Active roster */}
      <section>
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
          Roster ({active.length})
        </h2>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {active.map((entry: RosterEntry) => {
            const isMyKid = myKidIds.has(entry.player_id);
            const name = `${entry.first_name} ${entry.last_name}`;
            return (
              <div key={entry.player_id} className="flex items-center justify-between px-4 py-3 gap-4">
                <div className="flex items-center gap-3">
                  {entry.jersey_number != null && (
                    <span className="text-sm font-mono text-gray-400 dark:text-gray-500 w-6 text-right shrink-0">
                      #{entry.jersey_number}
                    </span>
                  )}
                  {isMyKid ? (
                    <Link
                      href={`/parent/player/${entry.player_id}`}
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <span className="text-sm text-gray-900 dark:text-white">{name}</span>
                  )}
                  {isMyKid && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full font-medium">
                      My kid
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Inactive */}
      {inactive.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Inactive
          </h2>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800 opacity-60">
            {inactive.map((entry: RosterEntry) => (
              <div key={entry.player_id} className="flex items-center gap-3 px-4 py-3">
                {entry.jersey_number != null && (
                  <span className="text-sm font-mono text-gray-400 dark:text-gray-500 w-6 text-right shrink-0">
                    #{entry.jersey_number}
                  </span>
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {entry.first_name} {entry.last_name}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
