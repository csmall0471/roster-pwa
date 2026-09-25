import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";
import CardEditor, { type AssignTarget } from "@/app/_components/cardgen/CardEditor";
import { toAssignTargets } from "@/app/_components/cardgen/assign-targets";
import DraftsSection from "./DraftsSection";
import SeasonCardsSection from "./SeasonCardsSection";

// Standalone card creator (Tools → Card Creator). Build a card from any photo
// without first picking a player; the finished card exports to the photo
// library / downloads, can be assigned to a player, or (owner) saved as a draft
// for a player that isn't assigned yet.
export default async function CardCreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const { draft: draftId } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Owner = owns at least one team; only the owner gets drafts.
  const { count: teamCount } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  const isOwner = (teamCount ?? 0) > 0;

  // Players this user owns, with their current team — offered as assign targets.
  // (Scoped helpers own no players, so they get export-only.)
  const { data: players } = await supabase
    .from("players")
    .select("id, first_name, last_name, date_of_birth")
    .eq("user_id", user.id);

  let assignTargets: AssignTarget[] = [];
  // Teammates per team (for group cards), built from the roster rows already
  // loaded below — no extra query. Only the owner's own players are available
  // here, so each team lists the owner's players who are active on it.
  const teammatesByTeam: Record<string, { id: string; firstName: string; lastName: string }[]> = {};
  const ids = (players ?? []).map((p) => p.id as string);
  if (ids.length > 0) {
    const { data: rosterRows } = await supabase
      .from("roster")
      .select(
        "player_id, status, jersey_number, teams(id, name, season, age_group, season_start, season_end, sport, assistant_coach_parent_ids)"
      )
      .in("player_id", ids)
      .order("created_at", { ascending: false });

    // Build the teammates-per-team map from the roster rows just loaded.
    const teammateNameById = new Map(
      (players ?? []).map((p) => [
        p.id as string,
        { firstName: p.first_name as string, lastName: p.last_name as string },
      ])
    );
    const teammateRows = (rosterRows ?? []) as unknown as Array<{
      player_id: string | null;
      status: string | null;
      teams: { id: string } | null;
    }>;
    for (const r of teammateRows) {
      const tId = r.teams?.id;
      if (!tId || r.status !== "active" || !r.player_id) continue;
      const name = teammateNameById.get(r.player_id);
      if (!name) continue;
      const list = (teammatesByTeam[tId] ??= []);
      if (list.some((m) => m.id === r.player_id)) continue;
      list.push({ id: r.player_id, firstName: name.firstName, lastName: name.lastName });
    }

    // Resolve each team's assistant-coach parent ids to names, so picking a
    // player pre-fills the card's coaching from their team.
    const rows = (rosterRows ?? []) as unknown as Array<{
      teams: { id: string; assistant_coach_parent_ids: string[] | null } | null;
    }>;
    const coachIds = [
      ...new Set(rows.flatMap((r) => r.teams?.assistant_coach_parent_ids ?? [])),
    ];
    const nameByParent = new Map<string, string>();
    if (coachIds.length) {
      const { data: coachRows } = await supabase
        .from("parents")
        .select("id, first_name, last_name")
        .in("id", coachIds);
      for (const c of coachRows ?? []) {
        nameByParent.set(c.id as string, `${c.first_name} ${c.last_name}`.trim());
      }
    }
    const assistantByTeam = new Map<string, string>();
    for (const r of rows) {
      const t = r.teams;
      if (!t) continue;
      const names = (t.assistant_coach_parent_ids ?? [])
        .map((cid) => nameByParent.get(cid))
        .filter(Boolean) as string[];
      if (names.length) assistantByTeam.set(t.id, names.join(", "));
    }

    assignTargets = toAssignTargets(
      players ?? [],
      (rosterRows ?? []) as unknown as Parameters<typeof toAssignTargets>[1]
    ).map((t) => ({
      ...t,
      assistantCoaches: t.teamId ? assistantByTeam.get(t.teamId) ?? null : null,
    }));
  }

  // Reopen a draft (owner only). RLS scopes to this user. Try the assignment
  // columns first; fall back if the player_id/team_id migration isn't applied.
  let initialDesign: CardDesign | null = null;
  let initialAssignKey: string | undefined;
  if (isOwner && draftId) {
    const rich = await supabase
      .from("card_drafts")
      .select("card_design, player_id, team_id")
      .eq("id", draftId)
      .maybeSingle();
    const row = rich.error
      ? (await supabase.from("card_drafts").select("card_design").eq("id", draftId).maybeSingle()).data
      : rich.data;
    initialDesign = (row?.card_design as CardDesign | null) ?? null;
    const playerId = (row as { player_id?: string | null } | null)?.player_id ?? null;
    const teamId = (row as { team_id?: string | null } | null)?.team_id ?? null;
    if (playerId) initialAssignKey = `${playerId}::${teamId ?? "none"}`;
  }

  return (
    <div className="max-w-2xl lg:max-w-none">
      <Link href="/teams" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back
      </Link>

      <div className="mt-3 mb-5 lg:max-w-2xl">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Card Creator</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Build a player card from any photo, then save it to your photos, assign it to a player
          {isOwner ? ", or save it as a draft for a player that isn't assigned yet" : ""}.
        </p>
      </div>

      {/* Streamed so the editor paints immediately (its own query can be heavy). */}
      {isOwner && (
        <Suspense fallback={null}>
          <SeasonCardsSection />
        </Suspense>
      )}

      <CardEditor
        key={draftId ?? "new"}
        standalone
        playerId={null}
        teamId={null}
        teamName=""
        ageGroup={null}
        season={null}
        firstName=""
        lastName=""
        jersey={null}
        playerAge={null}
        returnHref="/teams"
        assignTargets={assignTargets}
        teammatesByTeam={teammatesByTeam}
        allowDrafts={isOwner}
        draftId={draftId}
        initialDesign={initialDesign}
        initialAssignKey={initialAssignKey}
      />

      {/* Drafts stream in below the editor with a spinner, so the page shows
          right away instead of blocking on this query. */}
      {isOwner && (
        <Suspense
          fallback={
            <div className="mt-10 flex items-center justify-center gap-2 py-6 text-sm text-gray-400 dark:text-gray-500">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              Loading drafts…
            </div>
          }
        >
          <DraftsSection activeId={draftId ?? null} />
        </Suspense>
      )}
    </div>
  );
}
