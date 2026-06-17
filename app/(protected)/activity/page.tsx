import { createClient } from "@/lib/supabase/server"
import ActivityControls from "./_components/ActivityControls"

const TZ = "America/Phoenix"

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  // Auth
  login:                    { label: "Login",               color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  // Training
  training_signup:          { label: "Training signup",     color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  training_cancel:          { label: "Training cancel",     color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  training_series_expanded: { label: "Series expanded",     color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  training_payment_clicked: { label: "Payment link",        color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  // Snacks
  snack_signup:             { label: "Snack signup",        color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  snack_cancel:             { label: "Snack cancel",        color: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  snack_form_opened:        { label: "Snack form opened",   color: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" },
  // Player / guardian edits
  player_info_updated:      { label: "Player info updated", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  guardian_updated:         { label: "Guardian updated",    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  guardian_added:           { label: "Guardian added",      color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  // Photo cards
  player_card_download:     { label: "Card download",       color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  player_card_download_all: { label: "Card download all",   color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  photo_card_opened:        { label: "Card opened",         color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400" },
  card_flipped:             { label: "Card flipped",        color: "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400" },
  // Card generator
  card_editor_opened:       { label: "Editor opened",       color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  card_photo_uploaded:      { label: "Photo uploaded",      color: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300" },
  card_bg_removed:          { label: "BG removed",          color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" },
  card_bg_removal_failed:   { label: "BG removal failed",   color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  card_template_picked:     { label: "Template picked",     color: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400" },
  card_bg_image_uploaded:   { label: "Custom BG",           color: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400" },
  card_side_switched:       { label: "Side switched",       color: "bg-pink-50 text-pink-600 dark:bg-pink-900/20 dark:text-pink-400" },
  card_scouting_generated:  { label: "AI scouting",         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  card_lookalike_generated: { label: "AI lookalike",        color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  card_saved:               { label: "Card saved",          color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  card_save_failed:         { label: "Card save failed",    color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  card_deleted:             { label: "Card deleted",        color: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  // Browsing
  team_tab_viewed:          { label: "Team tab",            color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  team_photo_viewed:        { label: "Team photo",          color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  past_seasons_expanded:    { label: "Past seasons",        color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  past_teams_expanded:      { label: "Past teams",          color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  calendar_month_changed:   { label: "Calendar nav",        color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  // Roster Creator tool
  rc_season_created:        { label: "RC: season created",  color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300" },
  rc_season_deleted:        { label: "RC: season deleted",  color: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  rc_roster_uploaded:       { label: "RC: roster uploaded", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  rc_analyze_started:       { label: "RC: analyze started", color: "bg-cyan-50 text-cyan-600 dark:bg-cyan-900/20 dark:text-cyan-400" },
  rc_analyze_completed:     { label: "RC: analyze done",    color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300" },
  rc_analyze_failed:        { label: "RC: analyze FAILED",  color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  rc_teams_generated:       { label: "RC: teams generated", color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  rc_generate_failed:       { label: "RC: generate FAILED", color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  rc_player_moved:          { label: "RC: player moved",    color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  rc_team_added:            { label: "RC: team added",      color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  rc_coach_team_added:      { label: "RC: coach team added",color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  rc_assistant_added:       { label: "RC: assistant added", color: "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400" },
  rc_team_deleted:          { label: "RC: team deleted",    color: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
  rc_lock_changed:          { label: "RC: lock changed",    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  rc_csv_exported:          { label: "RC: CSV exported",    color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  rc_roster_emailed:        { label: "RC: roster emailed",  color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" },
  rc_access_granted:        { label: "RC: access granted",  color: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300" },
  rc_access_revoked:        { label: "RC: access revoked",  color: "bg-fuchsia-50 text-fuchsia-600 dark:bg-fuchsia-900/20 dark:text-fuchsia-400" },
}

function fmtMeta(event: string, meta: Record<string, unknown> | null): string {
  if (!meta) return ""
  if (event === "training_signup" || event === "training_cancel") {
    const parts = []
    if (meta.session_title) parts.push(String(meta.session_title))
    if (meta.session_date)  parts.push(String(meta.session_date))
    if (meta.bulk && meta.count) parts.push(`× ${meta.count} sessions`)
    if (meta.by_admin) parts.push("(by admin)")
    return parts.join(" · ")
  }
  if (event === "snack_signup" || event === "snack_cancel") {
    const parts = []
    if (meta.team)      parts.push(String(meta.team))
    if (meta.opponent)  parts.push(`vs ${meta.opponent}`)
    if (meta.game_date) parts.push(String(meta.game_date))
    return parts.join(" · ")
  }
  if (event === "training_series_expanded") return meta.title ? String(meta.title) : ""
  if (event === "training_payment_clicked") return meta.method ? String(meta.method) : ""
  if (event === "player_card_download" || event === "photo_card_opened") {
    const parts = []
    if (meta.team)   parts.push(String(meta.team))
    if (meta.season) parts.push(String(meta.season))
    return parts.join(" · ")
  }
  if (event === "player_card_download_all") return meta.count ? `${meta.count} cards` : ""
  if (event === "past_teams_expanded") return meta.count ? `${meta.count} teams` : ""
  if (event === "team_tab_viewed") return meta.tab ? String(meta.tab) : ""
  if (event === "calendar_month_changed") return meta.direction ? String(meta.direction) : ""
  if (event === "card_editor_opened" || event === "card_saved" || event === "card_deleted") {
    const parts = []
    if (meta.team)     parts.push(String(meta.team))
    if (meta.season)   parts.push(String(meta.season))
    if (meta.has_back) parts.push("front+back")
    return parts.join(" · ")
  }
  if (event === "card_template_picked")     return meta.template_id ? String(meta.template_id) : ""
  if (event === "card_side_switched" || event === "card_flipped") return meta.side ? String(meta.side) : ""
  if (event === "card_lookalike_generated") return meta.name ? String(meta.name) : ""
  if (event === "card_bg_removed")          return meta.ms ? `${meta.ms} ms` : ""
  if (event === "card_bg_removal_failed" || event === "card_save_failed") {
    return meta.error ? String(meta.error).slice(0, 60) : ""
  }
  // ── Roster Creator ──
  if (event === "rc_analyze_completed") {
    const parts = []
    if (meta.players) parts.push(`${meta.players} players`)
    if (meta.seconds != null) parts.push(`${meta.seconds}s`)
    if (meta.buddyLinks != null) parts.push(`${meta.buddyLinks} buddies`)
    if (meta.unmatched_coaches) parts.push(`${meta.unmatched_coaches} unmatched coaches`)
    return parts.join(" · ")
  }
  if (event === "rc_analyze_failed" || event === "rc_generate_failed") {
    return meta.error ? String(meta.error).slice(0, 80) : ""
  }
  if (event === "rc_teams_generated") {
    const parts = []
    if (meta.divisions != null) parts.push(`${meta.divisions} divisions`)
    if (meta.players != null) parts.push(`${meta.players} players`)
    return parts.join(" · ")
  }
  if (event === "rc_coach_team_added" || event === "rc_assistant_added") {
    const parts = []
    if (meta.coach) parts.push(String(meta.coach))
    if (meta.reason) parts.push(`(${meta.reason})`)
    if (meta.attached) parts.push(`${meta.attached} kids`)
    return parts.join(" · ")
  }
  if (event === "rc_team_added") return meta.kind ? String(meta.kind) : ""
  if (event === "rc_lock_changed") return `${meta.scope ?? ""} ${meta.locked ? "locked" : "unlocked"}`.trim()
  if (event === "rc_csv_exported") return meta.rows ? `${meta.rows} rows` : ""
  if (event === "rc_roster_emailed") return meta.to ? String(meta.to) : ""
  if (event === "rc_season_created") return meta.name ? String(meta.name) : ""
  if (event === "rc_roster_uploaded") return [meta.mode, meta.divisions ? `${meta.divisions} divisions` : ""].filter(Boolean).join(" · ")
  if (event === "rc_access_granted") return meta.label ? String(meta.label) : ""
  return ""
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: TZ,
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit", hour12: true,
  })
}

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; parent_id?: string; limit?: string }>
}) {
  const { event: filterEvent, parent_id: filterParentId, limit: limitParam } = await searchParams
  const limit = Math.min(parseInt(limitParam ?? "100") || 100, 500)

  const supabase = await createClient()

  const [{ data: rows }, { data: allParents }, { data: { user } }, { data: adminLabels }] = await Promise.all([
    (() => {
      let q = supabase
        .from("user_activity")
        .select(`id, event, metadata, created_at, parents(id, first_name, last_name, phone)`)
        .order("created_at", { ascending: false })
        .limit(limit)
      if (filterEvent)    q = q.eq("event", filterEvent)
      if (filterParentId) q = q.eq("parent_id", filterParentId)
      return q
    })(),
    supabase.from("parents").select("id, first_name, last_name").order("first_name"),
    supabase.auth.getUser(),
    supabase.rpc("roster_admin_labels"),
  ])

  // Tool events (Roster Creator) are attributed to an auth user via
  // metadata.actor_user_id — the owner (the viewer) or a shared roster admin.
  const labelByUser = new Map<string, string>(
    ((adminLabels ?? []) as { auth_user_id: string; label: string | null }[]).map((r) => [r.auth_user_id, r.label ?? "Admin"])
  )
  const actorOf = (meta: Record<string, unknown> | null): { name: string; admin: boolean } | null => {
    const uid = meta && typeof meta.actor_user_id === "string" ? (meta.actor_user_id as string) : null
    if (!uid) return null
    if (user && uid === user.id) return { name: "You (owner)", admin: false }
    const label = labelByUser.get(uid)
    return { name: label ?? "Unknown user", admin: true }
  }

  // Summary counts
  const counts: Record<string, number> = {}
  if (rows) {
    for (const r of rows) {
      counts[r.event] = (counts[r.event] ?? 0) + 1
    }
  }

  const eventKeys = Object.keys(EVENT_LABELS)
  const parents = allParents ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">Activity Log</h1>
        <ActivityControls
          parents={parents}
          currentParentId={filterParentId ?? null}
          currentEvent={filterEvent ?? null}
        />
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        <a
          href={filterParentId ? `/activity?parent_id=${filterParentId}` : "/activity"}
          className={`text-xs rounded-full px-3 py-1 border transition-colors ${
            !filterEvent
              ? "bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent"
              : "border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-gray-500"
          }`}
        >
          All ({rows?.length ?? 0})
        </a>
        {eventKeys.map((ev) => {
          const cfg   = EVENT_LABELS[ev]
          const count = counts[ev] ?? 0
          const params = new URLSearchParams()
          params.set("event", ev)
          if (filterParentId) params.set("parent_id", filterParentId)
          return (
            <a
              key={ev}
              href={`/activity?${params.toString()}`}
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
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">User</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Event</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {rows.map((row) => {
                const parent = row.parents as any
                const cfg    = EVENT_LABELS[row.event] ?? { label: row.event, color: "bg-gray-100 text-gray-600" }
                const detail = fmtMeta(row.event, row.metadata as any)
                const actor  = parent ? null : actorOf(row.metadata as any)
                return (
                  <tr key={row.id} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="px-4 py-2.5 text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {fmtTime(row.created_at)}
                    </td>
                    <td className="px-4 py-2.5">
                      {parent ? (
                        <button
                          onClick={undefined}
                          className="text-left"
                        >
                          <a
                            href={`/activity?parent_id=${parent.id}${filterEvent ? `&event=${filterEvent}` : ""}`}
                            className="text-xs text-gray-800 dark:text-gray-200 font-medium hover:underline"
                          >
                            {parent.first_name} {parent.last_name}
                          </a>
                          {parent.phone && (
                            <span className="ml-1.5 text-xs font-normal text-gray-400 dark:text-gray-500">{parent.phone}</span>
                          )}
                        </button>
                      ) : actor ? (
                        <span className="text-xs">
                          <span className="text-gray-800 dark:text-gray-200 font-medium">{actor.name}</span>
                          {actor.admin && (
                            <span className="ml-1.5 rounded-full bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                              shared admin
                            </span>
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
