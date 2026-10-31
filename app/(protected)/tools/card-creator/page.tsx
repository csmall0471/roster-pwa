import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { CardDesign } from "@/lib/types";
import CardEditor from "@/app/_components/cardgen/CardEditor";
import { buildPhotoDraftDesign } from "@/app/_components/cardgen/photo-draft-design";
import { loadAssignTargets, loadDraftEarmarkTarget } from "./load-targets";
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

  const { assignTargets: activeTargets, teammatesByTeam } = await loadAssignTargets(
    supabase,
    user.id
  );
  let assignTargets = activeTargets;

  // Reopen a draft (owner only). RLS scopes to this user. Try the assignment
  // columns first; fall back if the player_id/team_id migration isn't applied.
  let initialDesign: CardDesign | null = null;
  let initialAssignKey: string | undefined;
  if (isOwner && draftId) {
    const rich = await supabase
      .from("card_drafts")
      .select("card_design, player_id, team_id, front_url")
      .eq("id", draftId)
      .maybeSingle();
    const row = rich.error
      ? (await supabase.from("card_drafts").select("card_design").eq("id", draftId).maybeSingle()).data
      : rich.data;
    initialDesign = (row?.card_design as CardDesign | null) ?? null;
    const playerId = (row as { player_id?: string | null } | null)?.player_id ?? null;
    const teamId = (row as { team_id?: string | null } | null)?.team_id ?? null;
    if (playerId) {
      initialAssignKey = `${playerId}::${teamId ?? "none"}`;
      if (!assignTargets.some((t) => t.key === initialAssignKey)) {
        const earmark = await loadDraftEarmarkTarget(supabase, user.id, playerId, teamId);
        if (earmark) assignTargets = [...assignTargets, earmark];
        else initialAssignKey = undefined;
      }
      // Nothing is designed on a photo-only draft yet, so show the player's
      // current team details, not the ones from when the photo was uploaded.
      const frontUrl = (row as { front_url?: string | null } | null)?.front_url;
      const target = assignTargets.find((t) => t.key === initialAssignKey);
      if (target && !frontUrl && initialDesign?.source_photo_url) {
        initialDesign = {
          ...buildPhotoDraftDesign(target, initialDesign.source_photo_url),
          cutout_url: initialDesign.cutout_url,
        };
      }
    }
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
        {isOwner && (
          <Link
            href="/tools/card-creator/bulk"
            className="mt-3 inline-block rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            📸 Upload team photos as drafts
          </Link>
        )}
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
        <div id="drafts" className="scroll-mt-20">
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
        </div>
      )}
    </div>
  );
}
