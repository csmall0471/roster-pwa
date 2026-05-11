import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import PhoneForm from "./_components/PhoneForm";
import PreviewBanner from "./_components/PreviewBanner";

function playerHref(id: string, phone: string) {
  return `/preview/player/${id}?phone=${encodeURIComponent(phone)}`;
}
function teamHref(id: string, phone: string) {
  return `/preview/team/${id}?phone=${encodeURIComponent(phone)}`;
}

function formatDateRange(start: string | null, end: string | null) {
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", year: "numeric" });
  if (start && end) return `${fmt(start)} – ${fmt(end)}`;
  if (start) return `From ${fmt(start)}`;
  if (end) return `Until ${fmt(end)}`;
  return null;
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "").slice(-10);
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ phone?: string }>;
}) {
  const { phone: rawPhone } = await searchParams;
  const supabase = await createClient();

  // ── No phone yet — show search form ──────────────────────────
  if (!rawPhone?.trim()) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">View as Parent</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Enter a parent&apos;s phone number to preview exactly what they see.
        </p>
        <PhoneForm />
      </div>
    );
  }

  const inputDigits = normalizePhone(rawPhone);
  if (inputDigits.length < 7) redirect("/preview");

  // ── Coach can see all parents — find matching phone ───────────
  const { data: allParents } = await supabase
    .from("parents")
    .select("id, first_name, last_name, phone, email");

  const matchedParents = (allParents ?? []).filter(
    (p) => p.phone && normalizePhone(p.phone) === inputDigits
  );

  if (matchedParents.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">View as Parent</h1>
        <PhoneForm defaultPhone={rawPhone} />
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
          No parent found with that phone number.
        </p>
      </div>
    );
  }

  const parentIds = matchedParents.map((p) => p.id);
  const parentNames = matchedParents
    .map((p) => `${p.first_name} ${p.last_name}`)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(", ");

  // ── Get all player IDs linked to those parents ────────────────
  const { data: ppRows } = await supabase
    .from("player_parents")
    .select("player_id")
    .in("parent_id", parentIds);

  const playerIds = [...new Set((ppRows ?? []).map((r) => r.player_id))];

  if (playerIds.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">View as Parent</h1>
        <PhoneForm defaultPhone={rawPhone} />
        <div className="mt-4"><PreviewBanner phone={rawPhone} name={parentNames} /></div>
        <p className="mt-4 text-sm text-gray-500">No players linked to this parent.</p>
      </div>
    );
  }

  // ── Fetch same data as real parent home page ──────────────────
  const [{ data: players }, { data: rosterRows }, { data: photoRows }] = await Promise.all([
    supabase
      .from("players")
      .select("id, first_name, last_name, date_of_birth")
      .in("id", playerIds),
    supabase
      .from("roster")
      .select("player_id, jersey_number, status, teams(id, name, sport, season, age_group, organization, season_start, season_end)")
      .in("player_id", playerIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("player_photos")
      .select("player_id, public_url")
      .eq("is_primary", true)
      .in("player_id", playerIds),
  ]);

  const primaryPhotos: Record<string, string> = {};
  for (const row of photoRows ?? []) primaryPhotos[row.player_id] = row.public_url;

  const rosterByPlayer: Record<string, any[]> = {};
  for (const row of rosterRows ?? []) {
    if (!rosterByPlayer[row.player_id]) rosterByPlayer[row.player_id] = [];
    rosterByPlayer[row.player_id].push(row);
  }
  for (const pid of Object.keys(rosterByPlayer)) {
    rosterByPlayer[pid].sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      const da = a.teams?.season_start ?? "";
      const db = b.teams?.season_start ?? "";
      return db.localeCompare(da);
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">View as Parent</h1>
      <PhoneForm defaultPhone={rawPhone} />
      <div className="mt-4"><PreviewBanner phone={rawPhone} name={parentNames} /></div>

      {/* ── Same UI as parent home page ── */}
      <div className="space-y-6 mt-6">
        {(players ?? []).map((player) => {
          const photo = primaryPhotos[player.id];
          const teamEntries = rosterByPlayer[player.id] ?? [];
          return (
            <div key={player.id} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <Link href={playerHref(player.id, rawPhone)} className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                {photo ? (
                  <Image
                    src={photo}
                    alt={`${player.first_name} ${player.last_name}`}
                    width={56} height={72}
                    className="w-14 h-[72px] object-cover rounded-xl border border-gray-200 dark:border-gray-700 shrink-0"
                  />
                ) : (
                  <div className="w-14 h-[72px] rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-300 dark:text-gray-600 text-2xl shrink-0">
                    👤
                  </div>
                )}
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {player.first_name} {player.last_name}
                  </p>
                  {player.date_of_birth && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      {new Date(player.date_of_birth + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </p>
                  )}
                </div>
                <span className="ml-auto text-gray-400 dark:text-gray-500">→</span>
              </Link>

              {teamEntries.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800">
                  {teamEntries.map((entry: any, i: number) => {
                    const t = entry.teams;
                    if (!t) return null;
                    const inactive = entry.status !== "active";
                    const meta = [t.organization, t.sport, t.age_group, t.season].filter(Boolean).join(" · ");
                    const dateRange = formatDateRange(t.season_start, t.season_end);
                    return (
                      <Link key={i} href={teamHref(t.id, rawPhone)} className={`px-5 py-3 flex items-center justify-between gap-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${inactive ? "opacity-50" : ""}`}>
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                          {meta && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{meta}</p>}
                          {dateRange && <p className="text-xs text-gray-400 dark:text-gray-500">{dateRange}</p>}
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {entry.jersey_number != null && (
                            <span className="text-sm font-mono text-gray-500 dark:text-gray-400">#{entry.jersey_number}</span>
                          )}
                          <span className="text-gray-400 dark:text-gray-500">→</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

