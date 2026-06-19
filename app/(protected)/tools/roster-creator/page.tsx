import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewSeasonButton from "./NewSeasonButton";
import DeleteSeasonButton from "./DeleteSeasonButton";
import DeleteAllSeasonsButton from "./DeleteAllSeasonsButton";
import { canManageRosterAccess } from "./actions";

export default async function RosterCreatorPage() {
  const supabase = await createClient();

  const { data: seasons } = await supabase
    .from("tb_seasons")
    .select("id, name, sport, status, created_at, user_id, updated_at, updated_by, tb_players(count), tb_divisions(count)")
    .order("created_at", { ascending: false });

  // Only the coach owner manages who else can use the tool.
  const canManage = await canManageRosterAccess();

  // Resolve who created/edited each season — granted admins show their label,
  // anyone else (the team owner) shows as "Owner".
  const { data: labelRows } = await supabase.rpc("roster_admin_labels");
  const labelByUser = new Map<string, string>(
    (labelRows ?? []).map((r: { auth_user_id: string; label: string | null }) => [r.auth_user_id, r.label ?? "Admin"])
  );
  const actorName = (uid: string | null): string => (uid ? labelByUser.get(uid) : null) || "Owner";
  const relTime = (iso: string | null): string => {
    if (!iso) return "";
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d}d ago` : new Date(iso).toLocaleDateString();
  };

  type SeasonRow = {
    id: string;
    name: string;
    sport: string | null;
    status: string;
    created_at: string;
    user_id: string | null;
    updated_at: string | null;
    updated_by: string | null;
    tb_players: { count: number }[];
    tb_divisions: { count: number }[];
  };
  const rows = (seasons ?? []) as SeasonRow[];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roster Creator</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Build a season&rsquo;s divisions &amp; coaches, add your players, then auto-generate balanced
            rosters that respect coach, buddy, and practice-night requests.
          </p>
        </div>
        <div className="shrink-0">
          <NewSeasonButton />
        </div>
      </div>

      {/* How it works — the whole process at a glance */}
      <div className="mb-8 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          ["1", "Structure", "Add your divisions and coaches — upload a coaches file or build it by hand — and set each team's practice day."],
          ["2", "Players", "Import your signup export, then add, edit, or remove players. Claude matches every coach & buddy request to your roster."],
          ["3", "Build teams", "Auto-generate balanced teams that honor those requests, drag to fine-tune, then export or print."],
        ].map(([n, title, desc]) => (
          <div key={n} className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{n}</span>
              <span className="font-semibold text-gray-900 dark:text-white">{title}</span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <div className="mb-8 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-4 py-3 flex items-center justify-between gap-3">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            Share the Roster Creator (and other tools) with helpers and parents.
          </span>
          <Link
            href="/access"
            className="shrink-0 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
          >
            Manage access →
          </Link>
        </div>
      )}

      {rows.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Seasons
            </h2>
            <DeleteAllSeasonsButton count={rows.length} />
          </div>
          <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
            {rows.map((s) => {
              const players = s.tb_players?.[0]?.count ?? 0;
              const divisions = s.tb_divisions?.[0]?.count ?? 0;
              return (
                <li key={s.id} className="flex items-center hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <Link
                    href={`/tools/roster-creator/${s.id}`}
                    className="flex flex-1 min-w-0 items-center justify-between px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {s.name}
                        {s.sport && <span className="ml-2 text-xs font-normal text-gray-400">{s.sport}</span>}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {divisions} {divisions === 1 ? "division" : "divisions"} · {players}{" "}
                        {players === 1 ? "player" : "players"} · {new Date(s.created_at).toLocaleDateString()}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400 dark:text-gray-500">
                        <span>Created by <span className="font-medium text-gray-500 dark:text-gray-400">{actorName(s.user_id)}</span></span>
                        {s.updated_by && (
                          <span>· Last edited by <span className="font-medium text-gray-500 dark:text-gray-400">{actorName(s.updated_by)}</span>{s.updated_at ? ` · ${relTime(s.updated_at)}` : ""}</span>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-1 text-gray-600 dark:text-gray-300">
                      {s.status}
                    </span>
                  </Link>
                  <div className="pr-3 pl-1">
                    <DeleteSeasonButton seasonId={s.id} seasonName={s.name} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No seasons yet</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Click <strong>New season</strong> to set up your divisions and coaches.
          </p>
        </div>
      )}
    </div>
  );
}
