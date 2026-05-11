import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { PlayerPhoto } from "@/lib/types";
import SeasonHistory from "@/app/parent/player/_components/SeasonHistory";
import PhotoCardGallery from "@/app/parent/player/_components/PhotoCardGallery";
import EligibilityBar from "@/app/parent/_components/EligibilityBar";
import PreviewBanner from "../../_components/PreviewBanner";

function calcAge(dob: string) {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export default async function PreviewPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ phone?: string }>;
}) {
  const [{ id }, { phone: rawPhone }] = await Promise.all([params, searchParams]);
  const supabase = await createClient();

  const backHref = rawPhone ? `/preview?phone=${encodeURIComponent(rawPhone)}` : "/preview";

  const [{ data: player }, { data: photos }, { data: seasons }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, shirt_size, notes")
      .eq("id", id)
      .single(),
    supabase
      .from("player_photos")
      .select("*, teams(season_start)")
      .eq("player_id", id),
    supabase
      .from("roster")
      .select("jersey_number, status, teams(id, name, sport, season, age_group, organization, season_start, season_end)")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!player) notFound();

  const hasCcvFootball = (seasons ?? []).some(
    (s: any) =>
      s.teams?.organization === "CCV" &&
      s.teams?.sport?.toLowerCase().includes("football")
  );

  const sortedPhotos = [...(photos ?? [])].sort((a, b) => {
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    const da = (a.teams as unknown as { season_start: string | null } | null)?.season_start ?? a.created_at;
    const db = (b.teams as unknown as { season_start: string | null } | null)?.season_start ?? b.created_at;
    return db.localeCompare(da);
  });
  const primary = sortedPhotos.find((p: PlayerPhoto) => p.is_primary);

  const teamBasePath   = "/preview/team";
  const teamLinkSuffix = rawPhone ? `?phone=${encodeURIComponent(rawPhone)}` : "";

  return (
    <div className="max-w-2xl">
      <Link href={backHref} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      {rawPhone && <div className="mt-3"><PreviewBanner phone={rawPhone} /></div>}

      {/* Header */}
      <div className="flex items-start gap-5 mt-4 mb-6">
        <div className="shrink-0">
          {primary ? (
            <Image
              src={primary.public_url}
              alt={`${player.first_name} ${player.last_name}`}
              width={96} height={128}
              className="w-24 h-32 object-cover rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
            />
          ) : (
            <div className="w-24 h-32 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-3xl">
              👤
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 pt-1">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            {player.first_name} {player.last_name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {[
              player.date_of_birth ? `Age ${calcAge(player.date_of_birth)}` : null,
              player.shirt_size ? `Size ${player.shirt_size}` : null,
              player.date_of_birth
                ? `b. ${new Date(player.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                : null,
            ].filter(Boolean).join("  ·  ")}
          </p>
          {player.notes && (
            <p className="text-sm text-gray-500 dark:text-gray-400 italic mt-1">{player.notes}</p>
          )}
        </div>
      </div>

      {hasCcvFootball && (
        <div className="mb-6 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <EligibilityBar
            playerId={player.id}
            dob={player.date_of_birth ?? null}
            playerName={`${player.first_name} ${player.last_name}`}
          />
        </div>
      )}

      {seasons && seasons.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season history
          </h2>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SeasonHistory seasons={seasons as any} teamBasePath={teamBasePath} teamLinkSuffix={teamLinkSuffix} />
        </section>
      )}

      {sortedPhotos.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season cards ({sortedPhotos.length})
          </h2>
          <PhotoCardGallery photos={sortedPhotos} />
        </section>
      )}
    </div>
  );
}
