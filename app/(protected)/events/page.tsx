import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  published: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

export default async function EventsPage() {
  const supabase = await createClient();

  const { data: events } = await supabase
    .from("events")
    .select("id, title, status, starts_at, created_at, event_signups(count), event_views(count)")
    .order("created_at", { ascending: false });

  type EventListRow = {
    id: string;
    title: string;
    status: string;
    starts_at: string | null;
    created_at: string;
    event_signups: { count: number }[];
    event_views: { count: number }[];
  };
  const rows = (events ?? []) as EventListRow[];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Events</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create a signup page, share the link, and track who signs up and pays.
          </p>
        </div>
        <Link
          href="/events/new"
          className="shrink-0 inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + New event
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-10 text-center">
          <p className="text-gray-500 dark:text-gray-400">No events yet.</p>
          <Link
            href="/events/new"
            className="mt-3 inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Create your first event
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((e) => {
            const signups = e.event_signups?.[0]?.count ?? 0;
            const views = e.event_views?.[0]?.count ?? 0;
            return (
              <li
                key={e.id}
                className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/events/${e.id}`}
                      className="font-semibold text-gray-900 dark:text-white truncate hover:text-blue-600"
                    >
                      {e.title}
                    </Link>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[e.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {e.status}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {e.starts_at
                      ? new Date(e.starts_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "No date set"}
                    {" · "}
                    {signups} signed up · {views} opens
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-3 text-sm">
                  <Link
                    href={`/events/${e.id}`}
                    className="font-medium text-blue-600 hover:text-blue-800"
                  >
                    Manage →
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
