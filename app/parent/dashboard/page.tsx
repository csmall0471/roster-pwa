import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CalendarView from "./_components/CalendarView";
import type { CalEvent } from "./_components/CalendarView";
import { getParentEvents } from "./actions";

// Split a timestamptz into a local YYYY-MM-DD date and HH:MM time for the calendar.
function splitTimestamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return { date, time };
}

function fmtEventDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return ` · ${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function sportEmoji(sport: string | null): string {
  const s = (sport ?? "").toLowerCase();
  if (s.includes("basketball")) return "🏀";
  if (s.includes("football")) return "🏈";
  if (s.includes("soccer")) return "⚽";
  if (s.includes("baseball")) return "⚾";
  if (s.includes("softball")) return "🥎";
  if (s.includes("volleyball")) return "🏐";
  if (s.includes("tennis")) return "🎾";
  if (s.includes("lacrosse")) return "🥍";
  return "🏅";
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!parentLink) redirect("/login");
  const parentId = parentLink.parent_id;

  const { data: ppRows } = await supabase.rpc("get_my_player_ids");
  const playerIds = (ppRows ?? []).map((r: { player_id: string }) => r.player_id);

  if (playerIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">No players found. Contact your coach if this seems wrong.</p>
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];

  const [{ data: players }, { data: rosterRows }, { data: calendarSignups }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name")
      .in("id", playerIds),
    supabase
      .from("roster")
      .select("player_id, teams(id, name, sport, season, age_group, organization, season_start, season_end, mojo_code, snack_signup_enabled)")
      .in("player_id", playerIds)
      .eq("status", "active"),
    supabase
      .from("training_signups")
      .select("player_id, training_sessions!inner(id, title, session_date, session_time, location)")
      .in("player_id", playerIds)
      .gte("training_sessions.session_date", today),
  ]);

  // Build team → players map, filtering out past seasons
  const teamMap = new Map<string, { team: any; playerIds: string[] }>();
  for (const row of rosterRows ?? []) {
    const t = row.teams as any;
    if (!t) continue;
    // Exclude seasons whose end date has already passed
    if (t.season_end && t.season_end < today) continue;
    if (!teamMap.has(t.id)) teamMap.set(t.id, { team: t, playerIds: [] });
    teamMap.get(t.id)!.playerIds.push(row.player_id as string);
  }

  // Split into active (started) vs future (not yet started), sort each by season_start
  const allEntries = [...teamMap.values()];
  const twoWeeksOut = new Date();
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const twoWeeksStr = twoWeeksOut.toISOString().split("T")[0];

  const activeEntries = allEntries
    .filter(({ team }) => !team.season_start || team.season_start <= twoWeeksStr)
    .sort((a, b) => (a.team.season_start ?? "").localeCompare(b.team.season_start ?? ""));
  const futureEntries = allEntries
    .filter(({ team }) => team.season_start && team.season_start > twoWeeksStr)
    .sort((a, b) => (a.team.season_start ?? "").localeCompare(b.team.season_start ?? ""));

  const activeTeamIds = activeEntries.map(({ team }) => team.id);

  // Next upcoming game per active team
  const { data: upcomingGames } = activeTeamIds.length > 0
    ? await supabase
        .from("games")
        .select("id, team_id, game_date, game_time, opponent, location, is_home")
        .in("team_id", activeTeamIds)
        .gte("game_date", today)
        .order("game_date", { ascending: true })
    : { data: null };

  const nextGameByTeam = new Map<string, any>();
  for (const g of upcomingGames ?? []) {
    if (!nextGameByTeam.has(g.team_id)) nextGameByTeam.set(g.team_id, g);
  }

  const { data: mySnackSignups } = activeTeamIds.length > 0
    ? await supabase
        .from("snack_signups")
        .select("game_id")
        .eq("parent_id", parentId)
    : { data: null };
  const signedUpGameIds = new Set((mySnackSignups ?? []).map((s: any) => s.game_id));

  // Map all upcoming games by team (already sorted ascending from query)
  const gamesByTeam = new Map<string, any[]>();
  for (const g of upcomingGames ?? []) {
    if (!gamesByTeam.has(g.team_id)) gamesByTeam.set(g.team_id, []);
    gamesByTeam.get(g.team_id)!.push(g);
  }

  // Build combined calendar (games + training sessions)
  const trainingPlayerNames = new Map<string, string[]>()
  const trainingPlayerIds = new Map<string, string[]>()
  for (const row of calendarSignups ?? []) {
    const sess = row.training_sessions as any
    if (!sess) continue
    const player = (players ?? []).find((p) => p.id === row.player_id)
    if (!player) continue
    if (!trainingPlayerNames.has(sess.id)) trainingPlayerNames.set(sess.id, [])
    if (!trainingPlayerIds.has(sess.id)) trainingPlayerIds.set(sess.id, [])
    trainingPlayerNames.get(sess.id)!.push(`${player.first_name} ${player.last_name}`)
    trainingPlayerIds.get(sess.id)!.push(row.player_id as string)
  }
  const seenSessions = new Set<string>()
  const calEvents: CalEvent[] = []
  for (const g of upcomingGames ?? []) {
    const t = teamMap.get(g.team_id)?.team
    calEvents.push({
      date: g.game_date, time: g.game_time ?? null,
      emoji: sportEmoji(t?.sport ?? null),
      label: `${t?.name ?? "Game"}`,
      sublabel: `${g.is_home ? "vs" : "@"} ${g.opponent ?? "TBD"}${g.location ? ` · ${g.location}` : ""}`,
      href: `/parent/team/${g.team_id}?tab=schedule`,
      playerIds: teamMap.get(g.team_id)?.playerIds ?? [],
    })
  }
  for (const row of calendarSignups ?? []) {
    const sess = row.training_sessions as any
    if (!sess || seenSessions.has(sess.id)) continue
    seenSessions.add(sess.id)
    const names = trainingPlayerNames.get(sess.id)?.join(", ") ?? null
    calEvents.push({
      date: sess.session_date, time: sess.session_time ?? null,
      emoji: "🏃",
      label: sess.title,
      sublabel: names,
      href: "/parent/training",
      playerIds: trainingPlayerIds.get(sess.id) ?? [],
    })
  }
  calEvents.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time ?? "").localeCompare(b.time ?? ""))

  // Event RSVPs + invitations (service-role action, authorized by this session)
  const { rsvped: rsvpedEvents, declined: declinedEvents, invited: invitedEvents } = await getParentEvents();
  for (const ev of rsvpedEvents) {
    const { date, time } = splitTimestamp(ev.starts_at);
    calEvents.push({
      date, time,
      emoji: "🎟️",
      label: ev.title,
      sublabel: ev.location ? `RSVP'd · ${ev.location}` : "RSVP'd",
      href: `/event/${ev.slug}`,
      playerIds: [],
    })
  }
  calEvents.sort((a, b) => a.date !== b.date ? a.date.localeCompare(b.date) : (a.time ?? "").localeCompare(b.time ?? ""))

  const calPlayers = (players ?? []).map((p) => ({ id: p.id, firstName: p.first_name }))

  const playerMap = new Map((players ?? []).map((p) => [p.id, p]));
  const hasAny = activeEntries.length > 0 || futureEntries.length > 0;

  function TeamCard({ team, pids }: { team: any; pids: string[] }) {
    const nextGame = nextGameByTeam.get(team.id);
    const snackGame = (gamesByTeam.get(team.id) ?? []).find((g) => signedUpGameIds.has(g.id));
    const isSignedUp = !!snackGame;
    const isActive = !team.season_start || team.season_start <= today;
    const isUpcoming = team.season_start && team.season_start > today;

    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <Link
          href={`/parent/team/${team.id}`}
          className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-gray-900 dark:text-white">
                {sportEmoji(team.sport)} {team.name}
              </p>
              {isActive && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">
                  Active
                </span>
              )}
              {isUpcoming && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                  Upcoming
                </span>
              )}
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              {[team.organization, team.sport, team.age_group, team.season].filter(Boolean).join(" · ")}
            </p>
          </div>
          <span className="text-gray-400 dark:text-gray-500 text-sm">→</span>
        </Link>

        <div className="border-t border-gray-100 dark:border-gray-800">
          {pids.map((pid) => {
            const p = playerMap.get(pid);
            if (!p) return null;
            return (
              <Link
                key={pid}
                href={`/parent/player/${pid}`}
                className="px-5 py-2.5 flex items-center gap-2 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <span className="text-sm">👤</span>
                <span className="text-sm font-medium text-blue-600 dark:text-blue-400">{p.first_name} {p.last_name}</span>
                <span className="text-gray-400 dark:text-gray-500 text-xs ml-auto">→</span>
              </Link>
            );
          })}

          <Link
            href={`/parent/team/${team.id}?tab=schedule`}
            className="px-5 py-3 flex items-start gap-3 border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className="text-base mt-0.5">📅</span>
            {nextGame ? (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {fmtDate(nextGame.game_date)}{fmtTime(nextGame.game_time)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {nextGame.is_home ? "vs" : "@"} {nextGame.opponent ?? "TBD"}
                  {nextGame.location ? ` · ${nextGame.location}` : ""}
                </p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 flex-1">No upcoming games scheduled</p>
            )}
            <span className="text-gray-400 dark:text-gray-500 text-xs mt-0.5 shrink-0">→</span>
          </Link>

          {team.snack_signup_enabled && nextGame && (
            <div className="px-5 py-3 flex items-center gap-3 border-b border-gray-100 dark:border-gray-800">
              <span className="text-base">🍎</span>
              {isSignedUp ? (
                <Link href={`/parent/team/${team.id}?tab=schedule`} className="text-sm text-green-600 dark:text-green-400 font-medium hover:underline">
                  Snacks: {fmtDate(snackGame.game_date)} ✓ →
                </Link>
              ) : (
                <Link href={`/parent/team/${team.id}?tab=schedule`} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                  Sign up to bring snacks →
                </Link>
              )}
            </div>
          )}

          {team.mojo_code && (
            <div className="px-5 py-3 flex items-center gap-3">
              <span className="text-base">📱</span>
              <a
                href={`https://get.mojo.sport/team-invite?code=${team.mojo_code}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-orange-600 dark:text-orange-400 hover:underline"
              >
                View team on Mojo →
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

      {!hasAny && (
        <p className="text-sm text-gray-500 dark:text-gray-400">No active or upcoming seasons right now.</p>
      )}

      {activeEntries.length > 0 && (
        <section className="mb-8">
          {futureEntries.length > 0 && (
            <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
              Active Seasons
            </h2>
          )}
          <div className="space-y-4">
            {activeEntries.map(({ team, playerIds: pids }) => (
              <TeamCard key={team.id} team={team} pids={pids} />
            ))}
          </div>
        </section>
      )}

      {futureEntries.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Upcoming seasons
          </h2>
          <div className="space-y-4">
            {futureEntries.map(({ team, playerIds: pids }) => (
              <TeamCard key={team.id} team={team} pids={pids} />
            ))}
          </div>
        </section>
      )}

      {invitedEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Pending invitations
          </h2>
          <div className="space-y-3">
            {invitedEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/event/${ev.slug}`}
                className="block bg-white dark:bg-gray-900 rounded-2xl border border-amber-300 dark:border-amber-800 px-5 py-4 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">✉️</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-white">{ev.title}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400">
                        Invitation
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {fmtEventDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ""}
                    </p>
                    <p className="text-sm text-amber-700 dark:text-amber-400 font-medium mt-1">
                      Tap to RSVP →
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {rsvpedEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Your events
          </h2>
          <div className="space-y-3">
            {rsvpedEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/event/${ev.slug}`}
                className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">🎟️</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-white">{ev.title}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-950 text-green-700 dark:text-green-400">
                        Going
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {fmtEventDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ""}
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-1">
                      View or edit your RSVP →
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {declinedEvents.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
            Not going
          </h2>
          <div className="space-y-3">
            {declinedEvents.map((ev) => (
              <Link
                key={ev.id}
                href={`/event/${ev.slug}`}
                className="block bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-base mt-0.5">🚫</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-500 dark:text-gray-400">{ev.title}</p>
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
                        Not going
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {fmtEventDate(ev.starts_at)}{ev.location ? ` · ${ev.location}` : ""}
                    </p>
                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mt-1">
                      Changed your mind? Tap to RSVP →
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mb-8">
        <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3">
          Calendar
        </h2>
        <CalendarView events={calEvents} players={calPlayers} />
      </section>

    </div>
  );
}
