import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAssignTargets } from "../load-targets";
import BulkDraftUploader from "./BulkDraftUploader";

// Tools → Card Creator → Upload team photos: turn a batch of photos into drafts,
// one per player, with no design work. Drafts are an owner-only feature.
export default async function BulkDraftPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string }>;
}) {
  const { team } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count: teamCount } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((teamCount ?? 0) === 0) redirect("/tools/card-creator");

  const { assignTargets, error: loadError } = await loadAssignTargets(supabase, user.id);

  // Who already has a draft, so the picker can flag a likely double-up.
  const { data: draftRows } = await supabase
    .from("card_drafts")
    .select("player_id, team_id")
    .not("player_id", "is", null);
  const draftKeys = (draftRows ?? []).map((d) => `${d.player_id}::${d.team_id ?? "none"}`);

  return (
    <div className="max-w-5xl">
      <Link href="/tools/card-creator" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Card Creator
      </Link>
      <div className="mt-3 mb-5">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Upload team photos</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Add your photos, match each one to a player, and save them as drafts. You can design each
          card later.
        </p>
      </div>
      <BulkDraftUploader
        initialTargets={assignTargets}
        loadFailed={!!loadError}
        existingDraftKeys={draftKeys}
        initialTeamId={team ?? null}
      />
    </div>
  );
}
