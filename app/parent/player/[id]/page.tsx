import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { PlayerPhoto } from "@/lib/types";
import SeasonHistory from "../_components/SeasonHistory";
import PhotoCardGallery from "../_components/PhotoCardGallery";
import PlayerInfoForm from "./_components/PlayerInfoForm";
import PlayerPhotoUploader from "./_components/PlayerPhotoUploader";
import GuardiansSection from "./_components/GuardiansSection";
import SiblingsSection from "@/app/_components/SiblingsSection";
import { dedupeSiblings } from "@/app/_components/dedupe-siblings";

function calcAge(dob: string) {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDob(dob: string) {
  return new Date(dob + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

export default async function ParentPlayerPage({
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
  const myParentId = parentLink.parent_id;

  const { data: myKidRows } = await supabase.rpc("get_my_player_ids");
  const myKidIds = new Set((myKidRows ?? []).map((r: { player_id: string }) => r.player_id));
  if (!myKidIds.has(id)) notFound();

  const [{ data: player }, { data: photos }, { data: seasons }, { data: guardianRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, shirt_size, grade, notes")
      .eq("id", id)
      .single(),
    supabase
      .from("player_photos")
      .select("*, teams(season_start)")
      .eq("player_id", id),
    supabase
      .from("roster")
      .select(`jersey_number, status, teams(id, name, sport, season, age_group, organization, season_start, season_end)`)
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
    supabase.rpc("get_player_guardians", { p_player_id: id }),
  ]);

  if (!player) notFound();

  const guardians = (guardianRows ?? []).map((p: any) => ({
    id: p.id as string,
    first_name: p.first_name as string,
    last_name: p.last_name as string,
    email: p.email as string,
    phone: (p.phone ?? null) as string | null,
  }));

  // Put the logged-in parent first
  guardians.sort((a: any, b: any) => {
    if (a.id === myParentId) return -1;
    if (b.id === myParentId) return 1;
    return 0;
  });

  const kidCount = myKidIds.size;

  // The family's saved siblings (a parent can read their own rows via RLS).
  const { data: sibRows } = await supabase
    .from("siblings")
    .select("name, attributes, player_id")
    .eq("parent_id", myParentId);
  const siblings = dedupeSiblings(sibRows);

  // Parents can only create NEW (free-text) siblings, never link existing
  // roster players. Free-text siblings fan out to all the parent's kids (stored
  // per guardian / family), so no linkablePlayers are passed here. Linking is a
  // coach-only ability on the coach player page.

  const sortedPhotos = [...(photos ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    const da = (a.teams as unknown as { season_start: string | null } | null)?.season_start ?? a.created_at;
    const db = (b.teams as unknown as { season_start: string | null } | null)?.season_start ?? b.created_at;
    return db.localeCompare(da);
  });
  const primary = sortedPhotos.find((p: PlayerPhoto) => p.is_primary);

  return (
    <div className="max-w-2xl space-y-6">
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5">
        <PlayerPhotoUploader
          playerId={player.id}
          photoUrl={primary?.public_url ?? null}
          name={`${player.first_name} ${player.last_name}`}
        />
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {player.first_name} {player.last_name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {[
              player.date_of_birth ? `Age ${calcAge(player.date_of_birth)}` : null,
              player.grade ? `${player.grade} grade` : null,
              player.shirt_size ? `Size ${player.shirt_size}` : null,
            ].filter(Boolean).join("  ·  ")}
          </p>
          {player.date_of_birth && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
              Birthday  {fmtDob(player.date_of_birth)}
            </p>
          )}
          {player.notes && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">{player.notes}</p>
          )}
          {/* Card creator hidden from parents for now — admins have access via /players/[id]/card. */}
        </div>
      </div>

      {/* Collapsible player info editor */}
      <PlayerInfoForm
        playerId={player.id}
        initialData={{
          first_name: player.first_name,
          last_name: player.last_name,
          date_of_birth: player.date_of_birth ?? null,
          shirt_size: player.shirt_size ?? null,
          grade: player.grade ?? null,
          notes: player.notes ?? null,
        }}
      />

      {/* Guardians */}
      <GuardiansSection
        playerId={player.id}
        initialGuardians={guardians}
        myParentId={myParentId}
        kidCount={kidCount}
      />

      {/* Siblings */}
      <SiblingsSection playerId={player.id} playerLastName={player.last_name} initialSiblings={siblings} />

      {/* Season history */}
      {seasons && seasons.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season history
          </h2>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SeasonHistory seasons={seasons as any} />
        </section>
      )}

      {/* Season cards */}
      {sortedPhotos.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season cards ({sortedPhotos.length})
          </h2>
          <PhotoCardGallery photos={sortedPhotos} playerId={player.id} />
        </section>
      )}
    </div>
  );
}
