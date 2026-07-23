import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewListButton from "./_components/NewListButton";

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<string, string> = {
  open: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  closed: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

export default async function QuestionsPage() {
  const supabase = await createClient();

  const [{ data: sets }, { data: teams }] = await Promise.all([
    supabase
      .from("question_sets")
      .select("id, title, description, status, created_at, questions(count), question_set_teams(count)")
      .order("created_at", { ascending: false }),
    supabase
      .from("teams")
      .select("id, name, season, age_group, season_start")
      .order("season_start", { ascending: false })
      .order("name", { ascending: true }),
  ]);

  type SetRow = {
    id: string;
    title: string;
    description: string | null;
    status: string;
    created_at: string;
    questions: { count: number }[];
    question_set_teams: { count: number }[];
  };
  const rows = (sets ?? []) as SetRow[];

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Questions</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Build a list of things to collect from your teams — jersey numbers, shirt sizes,
            anything — then fill in an answer for each kid, by team or by question.
          </p>
        </div>
        <NewListButton teams={teams ?? []} />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
          <div className="mb-2 text-3xl">📋</div>
          <p className="text-gray-500 dark:text-gray-400">No lists yet.</p>
          <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
            Create a list, pick the teams to ask, and start collecting.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((s) => {
            const qCount = s.questions?.[0]?.count ?? 0;
            const tCount = s.question_set_teams?.[0]?.count ?? 0;
            return (
              <li
                key={s.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/questions/${s.id}`}
                        className="truncate font-semibold text-gray-900 hover:text-blue-600 dark:text-white"
                      >
                        {s.title}
                      </Link>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          STATUS_BADGE[s.status] ?? STATUS_BADGE.open
                        }`}
                      >
                        {s.status}
                      </span>
                    </div>
                    {s.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500 dark:text-gray-400">
                        {s.description}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                      {qCount} question{qCount === 1 ? "" : "s"} · {tCount} team{tCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Link
                    href={`/questions/${s.id}`}
                    className="shrink-0 self-center rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    Open →
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
