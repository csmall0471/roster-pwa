// Notification helpers.
// Resend is active. SMS (Twilio) is stubbed until keys are provided:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

import { buildEmailHtml, btn, infoRow, infoTable, divider, esc } from "@/lib/email-template"

export type PaymentMethod = { label: string; link: string | null }

export type TrainingReminderPayload = {
  parentEmail:    string | null
  parentPhone:    string | null
  parentName:     string
  playerName:     string
  title:          string
  sessionDate:    string
  sessionTime:    string | null
  sessionEndTime?: string | null
  location:       string | null
  reminderEmail:  boolean
  reminderSms:    boolean
  paymentAmount?: string | null
  paymentMethods?: PaymentMethod[]
  hasPaid?:       boolean
  imageUrl?:      string | null
  notes?:         string | null
}

export type SignupChangePayload = {
  type: "signup" | "cancel"
  parentName: string
  teamName: string
  gameDate: string
  opponent: string | null
}

export type TrainingSignupChangePayload = {
  type: "signup" | "cancel"
  parentName: string
  playerName: string
  sessionTitle: string
  sessionDate: string
}

export type ReminderPayload = {
  parentEmail: string | null
  parentPhone: string | null
  parentName: string
  teamName: string
  gameDate: string
  gameTime: string | null
  opponent: string | null
  location: string | null
  isHome: boolean
  reminderEmail: boolean
  reminderSms: boolean
}

export type SnackConfirmationPayload = {
  type: "signup" | "cancel"
  parentEmail: string
  parentFirstName: string
  teamName: string
  opponent: string | null
  isHome: boolean
  gameDate: string
  gameTime: string | null
  location: string | null
  teamId: string
}

export type TrainingConfirmationPayload = {
  type: "signup" | "cancel"
  parentEmail: string
  parentFirstName: string
  playerName: string
  sessionTitle: string
  sessionDate: string
  sessionTime: string | null
  sessionEndTime?: string | null
  location: string | null
  paymentAmount?: string | null
  paymentMethods?: PaymentMethod[]
  hasPaid?: boolean   // for cancel: true if the signup was already paid
  bulkDates?: Array<{ date: string; time: string | null; endTime?: string | null }>
  imageUrl?: string | null
  description?: string | null
  notes?: string | null
}

// ── Formatting helpers ────────────────────────────────────────────────────────

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

function fmtTime(t: string | null) {
  if (!t) return ""
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  const h12 = h % 12 || 12
  return ` at ${h12}:${String(m).padStart(2, "0")} ${ampm}`
}

function fmtTime12(t: string): string {
  const [h, m] = t.split(":").map(Number)
  const ampm = h >= 12 ? "PM" : "AM"
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${ampm}`
}

function fmtTimeRange(start: string | null, end: string | null | undefined): string {
  if (!start) return ""
  if (!end) return ` at ${fmtTime12(start)}`
  return ` at ${fmtTime12(start)} – ${fmtTime12(end)}`
}

// ── ICS calendar builder ──────────────────────────────────────────────────────

function buildIcs(events: Array<{
  summary: string
  date: string
  timeStart: string | null
  timeEnd: string | null
  location?: string | null
}>): string {
  function fmtDtStart(date: string, time: string | null): string {
    const d = date.replace(/-/g, "")
    if (!time) return `DTSTART;VALUE=DATE:${d}`
    const [h, m] = time.split(":").slice(0, 2)
    return `DTSTART:${d}T${h.padStart(2, "0")}${(m ?? "00").padStart(2, "0")}00`
  }
  function fmtDtEnd(date: string, timeEnd: string | null, timeStart: string | null): string {
    const d = date.replace(/-/g, "")
    if (!timeEnd && !timeStart) {
      // all-day: end = next day
      const next = new Date(date + "T00:00:00")
      next.setDate(next.getDate() + 1)
      return `DTEND;VALUE=DATE:${next.toISOString().split("T")[0].replace(/-/g, "")}`
    }
    const t = timeEnd ?? (() => {
      const [h, m] = (timeStart ?? "09:00").split(":").map(Number)
      return `${String((h + 1) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    })()
    const [h, m] = t.split(":").slice(0, 2)
    return `DTEND:${d}T${h.padStart(2, "0")}${(m ?? "00").padStart(2, "0")}00`
  }
  const stamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z"
  const vevents = events.map((e, i) => {
    const lines = [
      "BEGIN:VEVENT",
      `UID:ts-${Date.now()}-${i}@cssports-az.com`,
      `DTSTAMP:${stamp}`,
      fmtDtStart(e.date, e.timeStart),
      fmtDtEnd(e.date, e.timeEnd, e.timeStart),
      `SUMMARY:${e.summary}`,
    ]
    if (e.location) lines.push(`LOCATION:${e.location}`)
    lines.push("END:VEVENT")
    return lines.join("\r\n")
  })
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//CS Sports//Training//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...vevents,
    "END:VCALENDAR",
  ].join("\r\n")
}

// ── Resend helper ─────────────────────────────────────────────────────────────

function buildFrom(): string {
  const name  = process.env.EMAIL_FROM_NAME ?? "CS Sports"
  const email = process.env.EMAIL_FROM ?? "onboarding@resend.dev"
  return name ? `${name} <${email}>` : email
}

function emailPayMethodHtml(method: PaymentMethod, paymentAmount?: string | null): string {
  if (!method.link) {
    return `<p style="margin:6px 0;font-size:14px;color:#374151;">${esc(method.label)}: pay at the session</p>`
  }
  if (method.link.startsWith("tel:")) {
    const phone = method.link.replace("tel:", "")
    return `<p style="margin:6px 0;font-size:14px;color:#374151;">${esc(method.label)}: <a href="${method.link}" style="color:#ea580c;text-decoration:none;">${esc(phone)}</a></p>`
  }
  let url = method.link
  if (url.includes("venmo.com") && paymentAmount) {
    const amt = paymentAmount.replace(/[^0-9.]/g, "")
    if (amt) url = `${url}${url.includes("?") ? "&" : "?"}txn=pay&amount=${amt}&note=Training`
  }
  return btn(method.label, url)
}

function locationMapRow(location: string): string {
  const encoded = encodeURIComponent(location)
  const appleUrl = `https://maps.apple.com/?q=${encoded}`
  const googleUrl = `https://www.google.com/maps/search/?api=1&query=${encoded}`
  return `<tr>
    <td style="padding:5px 16px 5px 0;font-size:14px;color:#6b7280;white-space:nowrap;font-weight:500;vertical-align:top;">Location</td>
    <td style="padding:5px 0;font-size:14px;color:#111827;vertical-align:top;">${esc(location)}<br><span style="font-size:12px;"><a href="${appleUrl}" style="color:#2563eb;text-decoration:none;">Apple Maps →</a>&nbsp;&nbsp;<a href="${googleUrl}" style="color:#2563eb;text-decoration:none;">Google Maps →</a></span></td>
  </tr>`
}

async function resendSend(params: {
  to: string
  subject: string
  text: string
  html?: string
  bcc?: string
  attachments?: Array<{ filename: string; content: Buffer; content_type?: string }>
}) {
  const { Resend } = await import("resend")
  const resend = new Resend(process.env.RESEND_API_KEY)
  return resend.emails.send({
    from: buildFrom(),
    to: params.to,
    subject: params.subject,
    text: params.text,
    ...(params.bcc ? { bcc: params.bcc } : {}),
    ...(params.html ? { html: params.html } : {}),
    ...(params.attachments?.length ? { attachments: params.attachments } : {}),
  })
}

// ── Coach snack signup/cancel notification ────────────────────────────────────

export async function notifyCoachSignupChange(payload: SignupChangePayload): Promise<void> {
  const action = payload.type === "signup" ? "signed up for" : "cancelled"
  const vs = payload.opponent ? ` vs ${payload.opponent}` : ""
  const subject = `Snack update: ${payload.parentName} ${action} snacks`
  const text = `${payload.parentName} ${action} bringing snacks for ${payload.teamName}${vs} on ${fmtDate(payload.gameDate)}.`
  await resendSend({ to: process.env.NOTIFY_EMAIL ?? "csmall0471@gmail.com", subject, text })
}

// ── Coach training signup/cancel notification ─────────────────────────────────

export async function notifyCoachTrainingChange(payload: TrainingSignupChangePayload): Promise<void> {
  const action = payload.type === "signup" ? "registered" : "cancelled"
  const prep   = payload.type === "signup" ? "for" : "from"
  const subject = `Training update: ${payload.playerName} ${action} ${prep} ${payload.sessionTitle}`
  const text    = `${payload.parentName} ${action} ${payload.playerName} ${prep} ${payload.sessionTitle} on ${fmtDate(payload.sessionDate)}.`
  await resendSend({ to: process.env.NOTIFY_EMAIL ?? "csmall0471@gmail.com", subject, text })
}

// ── Parent snack confirmation ─────────────────────────────────────────────────

export async function sendSnackConfirmation(payload: SnackConfirmationPayload): Promise<void> {
  const appUrl    = process.env.APP_URL ?? "https://cssports-az.com"
  const vs        = payload.opponent ? `${payload.isHome ? "vs" : "@"} ${payload.opponent}` : "your game"
  const dateStr   = `${fmtDate(payload.gameDate)}${fmtTime(payload.gameTime)}`
  const loc       = payload.location ? `\nLocation: ${payload.location}` : ""
  const manageUrl = `${appUrl}/parent/team/${payload.teamId}?tab=schedule`

  const subject = payload.type === "signup"
    ? `Signed up to bring snacks — ${payload.teamName}`
    : `Snack signup cancelled — ${payload.teamName}`
  const text = payload.type === "signup"
    ? `Hi ${payload.parentFirstName},\n\nYou're signed up to bring snacks for ${payload.teamName} ${vs} on ${dateStr}.${loc}\n\nTo cancel:\n${manageUrl}\n\nThank you!\n— Coach Connor`
    : `Hi ${payload.parentFirstName},\n\nYour snack signup for ${payload.teamName} ${vs} on ${dateStr} has been cancelled.\n\nSign up again at:\n${manageUrl}\n\nThank you!\n— Coach Connor`

  await resendSend({ to: payload.parentEmail, subject, text })
}

// ── Parent training confirmation ──────────────────────────────────────────────

export async function sendTrainingConfirmation(payload: TrainingConfirmationPayload): Promise<void> {
  const appUrl    = process.env.APP_URL ?? "https://cssports-az.com"
  const manageUrl = `${appUrl}/parent/training`
  const isSignup  = payload.type === "signup"
  const subject   = isSignup
    ? `Registered for ${payload.sessionTitle} — ${payload.playerName}`
    : `Training registration cancelled — ${payload.sessionTitle}`

  const dates = payload.bulkDates ?? [{
    date: payload.sessionDate,
    time: payload.sessionTime,
    endTime: payload.sessionEndTime ?? null,
  }]

  const methods     = payload.paymentMethods ?? []
  const linkedMethods = methods.filter(m => m.link)
  const hasCash     = methods.some(m => !m.link)

  // ── Plain-text fallback ──────────────────────────────────────────────────
  const dateLinesText = dates.length > 1
    ? dates.map(d => `  • ${fmtDateShort(d.date)}${fmtTimeRange(d.time, d.endTime)}`).join("\n")
    : `${fmtDate(dates[0].date)}${fmtTimeRange(dates[0].time, dates[0].endTime)}`
  const locLine  = payload.location ? `\nLocation: ${payload.location}` : ""
  const payLine  = payload.paymentAmount ? `\n\nAmount due: $${payload.paymentAmount}` : ""
  const payLinks = linkedMethods.map(m => `  • ${m.label}: ${m.link}`).join("\n")
  const cashLine = hasCash ? "  • Cash / Check at the session" : ""
  const payMethods = [payLinks, cashLine].filter(Boolean).join("\n")

  let text: string
  if (isSignup) {
    text = [
      `Hi ${payload.parentFirstName},`,
      "",
      `${payload.playerName} is registered for ${payload.sessionTitle}!`,
      "",
      dates.length > 1 ? `Sessions (${dates.length}):\n${dateLinesText}` : dateLinesText,
      locLine,
      payLine,
      payMethods ? `\nPay via:\n${payMethods}` : "",
      "",
      `To cancel or manage:\n${manageUrl}`,
      "",
      "See you there!\n— Coach Connor",
    ].filter(s => s !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim()
  } else {
    const refundNote = payload.hasPaid
      ? "\n\nCoach Connor will process a refund for any fees you have paid."
      : ""
    const dateSection = dates.length > 1
      ? `${dates.length} sessions:\n${dates.map(d => `  • ${fmtDateShort(d.date)}${fmtTimeRange(d.time, d.endTime)}`).join("\n")}`
      : `${fmtDate(dates[0].date)}${fmtTimeRange(dates[0].time, dates[0].endTime)}`
    text = `Hi ${payload.parentFirstName},\n\n${payload.playerName}'s registration for ${payload.sessionTitle} has been cancelled.\n\n${dateSection}${locLine}${refundNote}\n\nSign up again at:\n${manageUrl}\n\n— Coach Connor`
  }

  // ── HTML ─────────────────────────────────────────────────────────────────
  let htmlBody: string
  if (isSignup) {
    const introHtml = `<p style="margin:0 0 4px;font-size:15px;line-height:1.75;color:#374151;">Hi ${esc(payload.parentFirstName)},</p>
<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#374151;"><strong>${esc(payload.playerName)}</strong> is registered for <strong>${esc(payload.sessionTitle)}</strong>!</p>`

    let detailsHtml: string
    if (dates.length > 1) {
      const items = dates.map(d =>
        `<li style="margin-bottom:4px;">${esc(fmtDateShort(d.date))}${esc(fmtTimeRange(d.time, d.endTime))}</li>`
      ).join("\n")
      detailsHtml = `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Sessions (${dates.length}):</p>
<ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:#374151;line-height:1.75;">${items}</ul>`
      if (payload.location) {
        detailsHtml += infoTable(locationMapRow(payload.location))
      }
    } else {
      const rows = [
        infoRow("Date", fmtDate(dates[0].date)),
        dates[0].time ? infoRow("Time", fmtTimeRange(dates[0].time, dates[0].endTime).replace(" at ", "").trim()) : "",
        payload.location ? locationMapRow(payload.location) : "",
      ].filter(Boolean).join("\n")
      detailsHtml = infoTable(rows)
    }

    const payHtml = payload.paymentAmount
      ? [
          divider(),
          `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Payment</p>`,
          `<p style="margin:0 0 14px;font-size:14px;color:#374151;">Amount due: <strong>$${esc(payload.paymentAmount)}</strong></p>`,
          methods.map(m => emailPayMethodHtml(m, payload.paymentAmount)).join(""),
        ].filter(Boolean).join("\n")
      : ""

    const cancelHtml = [
      divider(),
      `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Need to cancel? Manage your registrations at any time.</p>`,
      btn("Manage Registrations", manageUrl, "#6b7280"),
    ].join("\n")

    const imageHtml = payload.imageUrl
      ? `<img src="${payload.imageUrl}" alt="" style="width:100%;height:192px;object-fit:cover;border-radius:8px;margin:16px 0;">`
      : ""

    const descriptionHtml = payload.description
      ? `<p style="margin:0 0 12px;font-size:14px;color:#374151;line-height:1.6;">${esc(payload.description)}</p>`
      : ""

    const notesHtml = payload.notes
      ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;font-style:italic;">${esc(payload.notes)}</p>`
      : ""

    htmlBody = [introHtml, detailsHtml, imageHtml, descriptionHtml, notesHtml, payHtml, cancelHtml].filter(Boolean).join("\n")
  } else {
    let cancelDetailsHtml: string
    if (dates.length > 1) {
      const items = dates.map(d =>
        `<li style="margin-bottom:4px;">${esc(fmtDateShort(d.date))}${esc(fmtTimeRange(d.time, d.endTime))}</li>`
      ).join("\n")
      cancelDetailsHtml = `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Sessions cancelled (${dates.length}):</p>
<ul style="margin:0 0 8px;padding-left:20px;font-size:14px;color:#374151;line-height:1.75;">${items}</ul>`
      if (payload.location) cancelDetailsHtml += infoTable(locationMapRow(payload.location))
    } else {
      const rows = [
        infoRow("Date", fmtDate(dates[0].date)),
        dates[0].time ? infoRow("Time", fmtTimeRange(dates[0].time, dates[0].endTime).replace(" at ", "").trim()) : "",
        payload.location ? locationMapRow(payload.location) : "",
      ].filter(Boolean).join("\n")
      cancelDetailsHtml = infoTable(rows)
    }

    const refundHtml = payload.hasPaid
      ? `${divider()}<p style="margin:0;font-size:14px;color:#374151;">Coach Connor will process a refund for any fees you have paid.</p>`
      : ""

    htmlBody = [
      `<p style="margin:0 0 4px;font-size:15px;line-height:1.75;color:#374151;">Hi ${esc(payload.parentFirstName)},</p>`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#374151;"><strong>${esc(payload.playerName)}</strong>'s registration for <strong>${esc(payload.sessionTitle)}</strong> has been cancelled.</p>`,
      cancelDetailsHtml,
      refundHtml,
      divider(),
      `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Sign up again anytime.</p>`,
      btn("View Training Sessions", manageUrl, "#6b7280"),
    ].filter(Boolean).join("\n")
  }

  const html = buildEmailHtml({
    htmlBody,
    teamName: payload.sessionTitle,
    organization: isSignup
      ? `Registration Confirmed · ${payload.playerName}`
      : `Registration Cancelled · ${payload.playerName}`,
    headerColor: "#ea580c",
  })

  // ── ICS attachment for signups ────────────────────────────────────────────
  const attachments: Array<{ filename: string; content: Buffer; content_type: string }> = []
  if (isSignup) {
    const icsContent = buildIcs(dates.map(d => ({
      summary: `${payload.sessionTitle} — ${payload.playerName}`,
      date: d.date,
      timeStart: d.time,
      timeEnd: d.endTime ?? null,
      location: payload.location,
    })))
    attachments.push({
      filename: "training.ics",
      content: Buffer.from(icsContent),
      content_type: "text/calendar",
    })
  }

  await resendSend({ to: payload.parentEmail, subject, text, html, bcc: process.env.NOTIFY_EMAIL, attachments: attachments.length ? attachments : undefined })
}

// ── Parent day-before reminder ────────────────────────────────────────────────

export async function sendSnackReminder(payload: ReminderPayload): Promise<void> {
  const vs = payload.opponent
    ? `${payload.isHome ? "vs" : "@"} ${payload.opponent}`
    : "your game"
  const dateStr = `${fmtDate(payload.gameDate)}${fmtTime(payload.gameTime)}`
  const locationLine = payload.location
    ? `\nLocation: ${payload.location}`
    : ""

  if (payload.reminderEmail && payload.parentEmail) {
    const subject = `Reminder: You're bringing snacks tomorrow — ${payload.teamName}`
    const text = `Hi ${payload.parentName},\n\nJust a reminder that you signed up to bring snacks for ${payload.teamName} ${vs} on ${dateStr}.${locationLine}\n\nThank you!\n— Coach Connor`
    await resendSend({ to: payload.parentEmail, subject, text })
  }

  if (payload.reminderSms && payload.parentPhone) {
    const body = `Reminder: You're bringing snacks for ${payload.teamName} ${vs} tomorrow (${dateStr}).${locationLine} — Coach Connor`
    // TODO: uncomment when Twilio keys are available
    // const twilio = (await import("twilio")).default;
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: payload.parentPhone, body });
    console.log("[notify:sms]", payload.parentPhone, body)
  }
}

// ── Training day-before reminder ──────────────────────────────────────────────

export async function sendTrainingReminder(payload: TrainingReminderPayload): Promise<void> {
  const appUrl   = process.env.APP_URL ?? "https://cssports-az.com"
  const dateStr  = `${fmtDate(payload.sessionDate)}${fmtTime(payload.sessionTime)}`
  const locLine  = payload.location ? `\nLocation: ${payload.location}` : ""
  const methods  = payload.paymentMethods ?? []
  const linked   = methods.filter(m => m.link)
  const hasCash  = methods.some(m => !m.link)
  const manageUrl = `${appUrl}/parent/training`

  if (payload.reminderEmail && payload.parentEmail) {
    const subject = `Reminder: Training session tomorrow — ${payload.title}`

    // Plain-text
    let payText = ""
    if (!payload.hasPaid && payload.paymentAmount) {
      const links = linked.map(m => `  • ${m.label}: ${m.link}`).join("\n")
      const cash  = hasCash ? "  • Cash / Check at the session" : ""
      payText = `\n\nAmount due: $${payload.paymentAmount}\nPay via:\n${[links, cash].filter(Boolean).join("\n")}`
    } else if (payload.hasPaid) {
      payText = "\n\nPayment confirmed — you're all set!"
    }
    const text = `Hi ${payload.parentName},\n\nJust a reminder that ${payload.playerName} is registered for ${payload.title} tomorrow (${dateStr}).${locLine}${payText}\n\nTo cancel:\n${manageUrl}\n\nSee you there!\n— Coach Connor`

    // HTML
    const timeDisplay = fmtTimeRange(payload.sessionTime, payload.sessionEndTime ?? null).replace(" at ", "").trim()
    const rows = [
      infoRow("Date", fmtDate(payload.sessionDate)),
      payload.sessionTime ? infoRow("Time", timeDisplay) : "",
      payload.location ? infoRow("Location", payload.location) : "",
    ].filter(Boolean).join("\n")

    const payHtml = !payload.hasPaid && payload.paymentAmount
      ? [
          divider(),
          `<p style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Payment</p>`,
          `<p style="margin:0 0 14px;font-size:14px;color:#374151;">Amount due: <strong>$${esc(payload.paymentAmount)}</strong></p>`,
          methods.map(m => emailPayMethodHtml(m, payload.paymentAmount)).join(""),
        ].filter(Boolean).join("\n")
      : payload.hasPaid
        ? `${divider()}<p style="margin:0;font-size:14px;color:#16a34a;font-weight:600;">Payment confirmed — you're all set!</p>`
        : ""

    const htmlBody = [
      `<p style="margin:0 0 4px;font-size:15px;line-height:1.75;color:#374151;">Hi ${esc(payload.parentName)},</p>`,
      `<p style="margin:0 0 20px;font-size:15px;line-height:1.75;color:#374151;"><strong>${esc(payload.playerName)}</strong> has training tomorrow — <strong>${esc(payload.title)}</strong>!</p>`,
      infoTable(rows),
      payload.imageUrl
        ? `<img src="${payload.imageUrl}" alt="" style="width:100%;height:192px;object-fit:cover;border-radius:8px;margin:16px 0;">`
        : "",
      payload.notes
        ? `<p style="margin:0 0 20px;font-size:13px;color:#6b7280;font-style:italic;">${esc(payload.notes)}</p>`
        : "",
      payHtml,
      divider(),
      `<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Need to cancel?</p>`,
      btn("Cancel Registration", manageUrl, "#6b7280"),
    ].filter(Boolean).join("\n")

    const html = buildEmailHtml({
      htmlBody,
      teamName: payload.title,
      organization: `Training Reminder · ${payload.playerName}`,
      headerColor: "#ea580c",
    })

    await resendSend({ to: payload.parentEmail, subject, text, html, bcc: process.env.NOTIFY_EMAIL })
  }

  if (payload.reminderSms && payload.parentPhone) {
    const body = `Reminder: ${payload.playerName} has training tomorrow — ${payload.title} (${dateStr}).${locLine} — Coach Connor`
    // TODO: uncomment when Twilio keys are available
    // const twilio = (await import("twilio")).default;
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({ from: process.env.TWILIO_FROM_NUMBER, to: payload.parentPhone, body });
    console.log("[notify:sms]", payload.parentPhone, body)
  }
}
