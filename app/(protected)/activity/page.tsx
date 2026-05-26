import { createClient } from "@/lib/supabase/server"

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  login:           { label: "Login",           color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  training_signup: { label: "Training signup",  color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  training_cancel: { label: "Training cancel",  color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  snack_signup:    { label: "Snack signup",     color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  snack_cancel:    { label: "Snack cancel",     color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
}

function fmtMeta(event: string, meta: Record<string, unknown> | null): string {
  if (!meta) return ""
  if (event === "training_signup" || event === "training_cancel") {
    const parts = []
    if (meta.session_title) parts.push(String(meta.session_title))
    if (meta.session_date)  parts.push(String(meta.session_date))
    if (meta.bulk && meta.count) parts.push(`× ${meta.count} sessions`)
    return parts.join(" · ")
  }
  if (event === "snack_signup" || event === "snack_cancel") {
    const parts = []
    if (meta.team)      parts.push(String(meta.team))
    if (meta.opponent)  parts.push(`vs ${meta.opponent}`)
    if (meta.game_date) parts.push(String(meta.game_date))
    return parts.join(" · ")
  }
  return ""
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  })
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; limit?: string }>
}) {
  const { event: filterEvent, limit: limitParam } = await searchParams
  const limit = Math.min(parseInt(limitParam ?? "100") || 100, 500)

  const supabase = await createClient()

  let query = supabase
    .from("user_activity")
    .select(`
      id, event, metadata, created_at,
      parents(id, first_name, last_name, phone)
    `)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (filterEvent) query = query.eq("event", filterEvent)

  const { data: rows } = await query

  // Summary counts
  const counts: Record<string, number> = {}
  if (rows) {
    for (const r of rows) {
      counts[r.event] = (counts[r.event] ?? 0) + 1
    }
  }

  const eventKeys = Object.keys(EVENT_LABELS)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500">Last {limit} events</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <a
          href="/activity"
          className={`text-xs rounded-full px-3 py-1 border transition-colors ${
            !filterEvent
              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent"
              : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500"
          }`}
        >
          All ({rows?.length ?? 0})
        </a>
        {eventKeys.map((ev) => {
          const cfg = EVENT_LABELS[ev]
          const count = counts[ev] ?? 0
          return (
            <a
              key={ev}
              href={`/activity?event=${ev}`}
              className={`text-xs rounded-full px-3 py-1 border transition-colors ${
                filterEvent === ev
                  ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent"
                  : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500"
              }`}
            >
              {cfg.label} ({count})
            </a>
          )
        })}
      </div>

      {/* Table */}
      {!rows || rows.length === 0 ? (
        <p className="text-sm text-gray-400 dark:text-gray-500 py-8 text-center">No activity yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">When</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Parent</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Event</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => {
                const parent = row.parents as any
                const cfg    = EVENT_LABELS[row.event] ?? { label: row.event, color: "bg-gray-100 text-gray-600" }
                const detail = fmtMeta(row.event, row.metadata as any)
                return (
                  <tr key={row.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {fmtTime(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {parent ? (
                        <span className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                          {parent.first_name} {parent.last_name}
                          {parent.phone && (
                            <span className="ml-1.5 font-normal text-gray-400 dark:text-gray-500">{parent.phone}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-medium rounded-full px-2.5 py-0.5 ${cfg.color}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400">
                      {detail || "—"}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
