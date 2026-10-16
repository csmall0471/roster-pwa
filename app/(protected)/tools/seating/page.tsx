import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadPlansList } from "./plan-data";
import NewPlanButton from "./NewPlanButton";

// Plans index for the Seating tool. The (protected) layout gates who gets here;
// RLS additionally scopes the list to the owner / 'seating' grantees, so an
// unauthorized visitor simply sees an empty list.
export default async function SeatingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const plans = await loadPlansList();

  return (
    <div className="max-w-4xl mx-auto">
      <Link href="/teams" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
        ← Back to teams
      </Link>

      <div className="mt-3 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Seating</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Map out who sits where — pull in your rosters, link an event&rsquo;s RSVPs, and
            auto-seat families and friends together.
          </p>
        </div>
        <div className="shrink-0">
          <NewPlanButton />
        </div>
      </div>

      {plans.length > 0 ? (
        <ul className="divide-y divide-gray-200 dark:divide-gray-800 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          {plans.map((p) => (
            <li key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 first:rounded-t-xl last:rounded-b-xl">
              <Link
                href={`/tools/seating/${p.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {p.title}
                    {p.eventTitle && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:text-blue-300 align-middle">
                        {p.eventTitle}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {p.peopleCount} {p.peopleCount === 1 ? "person" : "people"} · {p.seatedCount} seated ·{" "}
                    {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className="shrink-0 text-gray-400 dark:text-gray-500">→</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-12 text-center">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">No seating plans yet</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Click <strong>New plan</strong> to lay out your first outing — it starts with the
            Hideaway Lounge layout ready to edit.
          </p>
        </div>
      )}
    </div>
  );
}
