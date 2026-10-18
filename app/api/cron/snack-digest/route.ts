import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { buildEmailHtml, esc, sectionHeading } from "@/lib/email-template"
import { todayKey, shiftDayKey } from "@/lib/events/when"

export const dynamic = "force-dynamic"

// Weekly coach digest: who's bringing snacks to this week's games and which
// games still have an open slot. Vercel runs it Monday 8 AM Arizona (15:00 UTC,
// see vercel.json) and it emails NOTIFY_EMAIL.
//
// Protected by CRON_SECRET. Query params for testing:
//   ?dry=true          build the email and return it as JSON without sending
//   ?today=2026-10-19  pretend the run happened on this date

type Signup = {
  slot_number: number
  signer_name: string | null
  parents: { first_name: string | null; last_name: string | null } | null
}

type Game = {
  id: string
  team_id: string
  game_date: string
  game_time: string | null
  opponent: string | null
  location: string | null
  is_home: boolean
  snack_signups: Signup[] | null
}

type TeamRow = {
  id: string
  name: string
  snack_slots_per_game: number | null
}

type DigestGame = {
  team: TeamRow
  game: Game
  names: string[]
  slots: number
  open: number
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  })
}

function fmtDateShort(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  })
}

function fmtRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00")
  const e = new Date(end + "T00:00:00")
  const sameMonth = s.getMonth() === e.getMonth()
  const sStr = s.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  const eStr = e.toLocaleDateString("en-US", sameMonth ? { day: "numeric" } : { month: "short", day: "numeric" })
  return `${sStr}–${eStr}`
}

function fmtTime(t: string | null) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`
}

function signerName(s: Signup): string {
  if (s.signer_name?.trim()) return s.signer_name.trim()
  const p = s.parents
  const joined = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim()
  return joined || "Someone"
}

function gameLabel(g: Game): string {
  const vs = g.opponent ? `${g.is_home ? "vs" : "@"} ${g.opponent}` : "Game"
  const time = fmtTime(g.game_time)
  return time ? `${vs} · ${time}` : vs
}

// `day` through the Sunday that ends its week (Monday run → Mon..Sun).
function weekWindow(day: string) {
  const dow = new Date(day + "T00:00:00Z").getUTCDay() // 0 = Sun
  const daysToSunday = (7 - dow) % 7
  return { start: day, end: shiftDayKey(day, daysToSunday) }
}

// The Monday on or before `day`.
function mondayOf(day: string) {
  const dow = new Date(day + "T00:00:00Z").getUTCDay() // 0 = Sun
  return shiftDayKey(day, -((dow + 6) % 7))
}

export async function GET(request: Request) {
  const auth = request.headers.get("authorization")
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(request.url)
  const dry = url.searchParams.get("dry") === "true"
  const runDay = url.searchParams.get("today") ?? todayKey()
  let { start, end } = weekWindow(runDay)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.EMAIL_FROM ?? "roster@cssports-az.com"
  const appUrl = process.env.APP_URL ?? "https://cssports-az.com"
  const notifyEmail = process.env.NOTIFY_EMAIL

  if (!notifyEmail) {
    return Response.json({ error: "NOTIFY_EMAIL is not set" }, { status: 500 })
  }

  // ── Teams with snack signup on, and their games this week ─────────────────

  const { data: teams, error: teamErr } = await supabase
    .from("teams")
    .select("id, name, snack_slots_per_game")
    .eq("snack_signup_enabled", true)
    .order("name")

  if (teamErr) {
    return Response.json({ error: `teams query: ${teamErr.message}` }, { status: 500 })
  }

  const teamRows = (teams ?? []) as TeamRow[]
  const teamById = new Map(teamRows.map((t) => [t.id, t]))

  const teamIds = teamRows.map((t) => t.id)

  async function gamesBetween(from: string, to: string): Promise<Game[]> {
    if (teamIds.length === 0) return []
    const { data, error } = await supabase
      .from("games")
      .select(`
        id, team_id, game_date, game_time, opponent, location, is_home,
        snack_signups(slot_number, signer_name, parents(first_name, last_name))
      `)
      .in("team_id", teamIds)
      .gte("game_date", from)
      .lte("game_date", to)
      .order("game_date")
      .order("game_time")
    if (error) throw new Error(`games query: ${error.message}`)
    return (data ?? []) as unknown as Game[]
  }

  // This week's games. On a bye week, look ahead to the week of the next
  // scheduled game so the Monday email still says what's coming and who's on it.
  let games: Game[] = []
  let byeWeek = false
  try {
    games = await gamesBetween(start, end)
    if (games.length === 0 && teamIds.length > 0) {
      const { data: next, error: nextErr } = await supabase
        .from("games")
        .select("game_date")
        .in("team_id", teamIds)
        .gt("game_date", end)
        .order("game_date")
        .limit(1)
      if (nextErr) throw new Error(`next game query: ${nextErr.message}`)
      if (next?.[0]?.game_date) {
        byeWeek = true
        const w = weekWindow(mondayOf(next[0].game_date))
        start = w.start
        end = w.end
        games = await gamesBetween(start, end)
      }
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 })
  }

  const digest: DigestGame[] = games.map((game) => {
    const team = teamById.get(game.team_id)!
    const slots = Math.max(1, team.snack_slots_per_game ?? 1)
    const signups = [...(game.snack_signups ?? [])].sort((a, b) => a.slot_number - b.slot_number)
    const names = signups.map(signerName)
    return { team, game, names, slots, open: Math.max(0, slots - names.length) }
  })

  const needs = digest.filter((d) => d.open > 0)
  const covered = digest.filter((d) => d.open === 0)
  const rangeStr = fmtRange(start, end)

  // No games this week and none scheduled after it (off-season) → stay quiet.
  if (digest.length === 0) {
    if (!dry) {
      await supabase.from("cron_logs").insert({
        target_date: `snack-digest ${start}..${end}`,
        dry_run: false,
        snack_count: 0,
        summary_sent: false,
      })
    }
    return Response.json({ week: { start, end }, games: 0, sent: false, reason: "no games this week or later" })
  }

  // ── Build the email ───────────────────────────────────────────────────────

  const weekWord = byeWeek ? "next game week" : "this week"
  const subject = needs.length > 0
    ? `Snacks ${weekWord} (${rangeStr}): ${needs.length} game${needs.length === 1 ? "" : "s"} still need${needs.length === 1 ? "s" : ""} a sign up`
    : `Snacks ${weekWord} (${rangeStr}): all ${digest.length} game${digest.length === 1 ? "" : "s"} covered`

  const multiTeam = teamRows.length > 1
  const teamPrefix = (d: DigestGame) => (multiTeam ? `${d.team.name} — ` : "")

  const htmlGame = (d: DigestGame, highlightOpen: boolean) => {
    const lines: string[] = []
    for (let i = 0; i < d.slots; i++) {
      const name = d.names[i]
      lines.push(
        name
          ? `<span style="color:#111827;">${esc(name)}</span>`
          : `<span style="color:${highlightOpen ? "#dc2626" : "#9ca3af"};font-weight:600;">Open</span>`,
      )
    }
    const extras = d.names.slice(d.slots).map((n) => `<span style="color:#111827;">${esc(n)}</span>`)
    const who = [...lines, ...extras].join(", ")
    const loc = d.game.location ? ` · ${esc(d.game.location)}` : ""
    return `<tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;vertical-align:top;">
        <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">${esc(teamPrefix(d))}${esc(fmtDateShort(d.game.game_date))} · ${esc(gameLabel(d.game))}</p>
        ${(() => { const detail = d.slots > 1 ? `${d.slots} slots${loc}` : loc.replace(/^ · /, ""); return detail ? `<p style="margin:2px 0 0;font-size:13px;color:#6b7280;">${detail}</p>` : "" })()}
        <p style="margin:4px 0 0;font-size:14px;">${who}</p>
      </td>
    </tr>`
  }

  const teamLinks = teamRows
    .filter((t) => digest.some((d) => d.team.id === t.id))
    .map((t) => {
      const coachUrl = `${appUrl}/teams/${t.id}?tab=schedule`
      const parentUrl = `${appUrl}/parent/team/${t.id}?tab=schedule`
      return `<p style="margin:6px 0;font-size:13px;color:#6b7280;">
        <strong style="color:#111827;">${esc(t.name)}</strong> ·
        <a href="${coachUrl}" style="color:#2563eb;">Schedule</a> ·
        <a href="${parentUrl}" style="color:#2563eb;">Parent signup link</a>
      </p>`
    })
    .join("")

  const byeNote = byeWeek ? `No games this week. Next up is the week of ${fmtDate(start)}. ` : ""
  const intro = byeNote + (needs.length > 0
    ? `${needs.length} of ${digest.length} game${digest.length === 1 ? "" : "s"} ${weekWord} still ${needs.length === 1 ? "needs" : "need"} someone to bring snacks.`
    : `Every game ${weekWord} has snacks covered. Nice.`)

  const htmlBody = `
    <p style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Snack sign ups · ${esc(rangeStr)}</p>
    <p style="margin:0 0 8px;font-size:14px;color:#374151;">${esc(intro)}</p>
    ${needs.length > 0 ? `${sectionHeading("Still need a sign up")}<table cellpadding="0" cellspacing="0" width="100%">${needs.map((d) => htmlGame(d, true)).join("")}</table>` : ""}
    ${covered.length > 0 ? `${sectionHeading("Covered")}<table cellpadding="0" cellspacing="0" width="100%">${covered.map((d) => htmlGame(d, false)).join("")}</table>` : ""}
    ${sectionHeading("Links")}
    ${teamLinks}
  `

  const html = buildEmailHtml({ htmlBody, teamName: "Weekly snack digest", season: `Week of ${fmtDate(start)}` })

  const textGame = (d: DigestGame) => {
    const slotsText: string[] = []
    for (let i = 0; i < d.slots; i++) slotsText.push(d.names[i] ?? "OPEN")
    slotsText.push(...d.names.slice(d.slots))
    const loc = d.game.location ? ` (${d.game.location})` : ""
    return `  • ${teamPrefix(d)}${fmtDateShort(d.game.game_date)} · ${gameLabel(d.game)}${loc}\n      ${slotsText.join(", ")}`
  }

  const text = [
    `Snack sign ups · ${rangeStr}`,
    "",
    intro,
    "",
    needs.length > 0 ? `STILL NEED A SIGN UP\n${needs.map(textGame).join("\n")}\n` : "",
    covered.length > 0 ? `COVERED\n${covered.map(textGame).join("\n")}\n` : "",
    "LINKS",
    ...teamRows
      .filter((t) => digest.some((d) => d.team.id === t.id))
      .map((t) => `  ${t.name}\n    Schedule: ${appUrl}/teams/${t.id}?tab=schedule\n    Parent signup: ${appUrl}/parent/team/${t.id}?tab=schedule`),
  ].filter((l) => l !== "").join("\n")

  if (dry) {
    return Response.json({
      dry: true,
      week: { start, end },
      byeWeek,
      to: notifyEmail,
      subject,
      games: digest.length,
      needsSignup: needs.map((d) => ({ team: d.team.name, date: d.game.game_date, game: gameLabel(d.game), open: d.open, signedUp: d.names })),
      covered: covered.map((d) => ({ team: d.team.name, date: d.game.game_date, game: gameLabel(d.game), signedUp: d.names })),
      text,
      html,
    })
  }

  const { error: sendErr } = await resend.emails.send({ from, to: notifyEmail, subject, html, text })

  await supabase.from("cron_logs").insert({
    target_date: `snack-digest ${start}..${end}`,
    dry_run: false,
    snack_count: digest.length,
    summary_sent: !sendErr,
    error: sendErr ? `digest email: ${sendErr.message}` : null,
  })

  if (sendErr) {
    return Response.json({ week: { start, end }, sent: false, error: sendErr.message }, { status: 500 })
  }
  return Response.json({ week: { start, end }, byeWeek, sent: true, to: notifyEmail, games: digest.length, needsSignup: needs.length })
}
