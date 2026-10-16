import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlanData } from "../plan-data";
import SeatingTool from "./SeatingTool";

// An "active" team = its season is currently in progress (started, not ended) —
// same rule as the Teams / Card Creator pages. Teams without dates count as
// active so they're never hidden.
function isActiveTeam(start: string | null, end: string | null): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (end && end < today) return false;
  if (start && start > today) return false;
  return true;
}

const EVENT_STATUS_CHIP: Record<string, string> = {
  published: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export default async function SeatingPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await loadPlanData(id);
  if (!data) notFound();

  const supabase = await createClient();
  const [{ data: teamRows }, { data: playerRows }, { data: eventRows }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, name, season, season_start, season_end")
      .order("created_at", { ascending: false }),
    supabase.from("players").select("id, first_name, last_name").order("last_name"),
    supabase
      .from("events")
      .select("id, title, slug, status, starts_at")
      .order("starts_at", { ascending: false }),
  ]);

  const teams = (teamRows ?? []).map((t) => ({
    id: t.id as string,
    name: (t.name as string) ?? "Team",
    seasonLabel: (t.season as string | null) ?? null,
    active: isActiveTeam(t.season_start as string | null, t.season_end as string | null),
  }));

  const allPlayers = (playerRows ?? []).map((p) => ({
    id: p.id as string,
    name: `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim(),
  }));

  const events = (eventRows ?? []).map((e) => ({
    id: e.id as string,
    title: (e.title as string) ?? "Event",
    slug: (e.slug as string) ?? "",
    status: (e.status as string) ?? "draft",
    starts_at: (e.starts_at as string | null) ?? null,
  }));

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/tools/seating"
          className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
        >
          ← Tools
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{data.plan.title}</h1>
          {data.event && (
            <span className="inline-flex items-center gap-2 rounded-full border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300">
              🎟 {data.event.title}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  EVENT_STATUS_CHIP[data.event.status] ??
                  "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"
                }`}
              >
                {data.event.status}
              </span>
            </span>
          )}
        </div>
      </div>

      <SeatingTool data={data} teams={teams} allPlayers={allPlayers} events={events} />
    </div>
  );
}
