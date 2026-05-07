import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import type { PlayerPhoto } from "@/lib/types";
import SeasonHistory from "../_components/SeasonHistory";

function calcAge(dob: string) {
  const birth = new Date(dob + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
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

  // Verify this player is actually one of their kids
  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!parentLink) redirect("/login");

  const { data: myKidRows } = await supabase.rpc("get_my_player_ids");
  const myKidIds = new Set((myKidRows ?? []).map((r: { player_id: string }) => r.player_id));
  const ownership = myKidIds.has(id) ? { player_id: id } : null;

  if (!ownership) notFound();

  const [{ data: player }, { data: photos }, { data: seasons }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth, shirt_size, notes")
      .eq("id", id)
      .single(),
    supabase
      .from("player_photos")
      .select("*")
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("roster")
      .select(`jersey_number, status, teams(id, name, sport, season, age_group, organization, season_start, season_end)`)
      .eq("player_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (!player) notFound();

  const primary = (photos ?? []).find((p: PlayerPhoto) => p.is_primary);

  return (
    <div className="max-w-2xl">
      <Link href="/parent" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← My Kids
      </Link>

      {/* Header */}
      <div className="flex items-start gap-5 mt-4 mb-6">
        <div className="shrink-0">
          {primary ? (
            <Image
              src={primary.public_url}
              alt={`${player.first_name} ${player.last_name}`}
              width={96}
              height={128}
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

      {/* Season history */}
      {seasons && seasons.length > 0 && (
        <section className="mb-6">
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season history
          </h2>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <SeasonHistory seasons={seasons as any} />
        </section>
      )}

      {/* Season cards */}
      {photos && photos.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
            Season cards ({photos.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {(photos as PlayerPhoto[]).map((photo) => (
              <div key={photo.id} className="relative rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <Image
                  src={photo.public_url}
                  alt={`${photo.team_name ?? ""} ${photo.season ?? ""}`.trim() || "Season card"}
                  width={200}
                  height={280}
                  className="w-full object-cover aspect-[5/7]"
                />
                {photo.is_primary && (
                  <span className="absolute top-2 left-2 bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                    CURRENT
                  </span>
                )}
                {(photo.team_name || photo.season) && (
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                    <p className="text-white text-xs font-medium leading-tight">
                      {photo.team_name}{photo.team_name && photo.season ? " · " : ""}{photo.season}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
