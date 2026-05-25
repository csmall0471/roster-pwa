// Notification helpers.
// Resend is active. SMS (Twilio) is stubbed until keys are provided:
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER

export type TrainingReminderPayload = {
  parentEmail:   string | null;
  parentPhone:   string | null;
  parentName:    string;
  playerName:    string;
  title:         string;
  sessionDate:   string;
  sessionTime:   string | null;
  location:      string | null;
  reminderEmail: boolean;
  reminderSms:   boolean;
};

export type SignupChangePayload = {
  type: "signup" | "cancel";
  parentName: string;
  teamName: string;
  gameDate: string;       // ISO date string YYYY-MM-DD
  opponent: string | null;
};

export type TrainingSignupChangePayload = {
  type: "signup" | "cancel";
  parentName: string;
  playerName: string;
  sessionTitle: string;
  sessionDate: string;
};

export type ReminderPayload = {
  parentEmail: string | null;
  parentPhone: string | null;
  parentName: string;
  teamName: string;
  gameDate: string;
  gameTime: string | null;
  opponent: string | null;
  location: string | null;
  isHome: boolean;
  reminderEmail: boolean;
  reminderSms: boolean;
};

export type SnackConfirmationPayload = {
  type: "signup" | "cancel";
  parentEmail: string;
  parentFirstName: string;
  teamName: string;
  opponent: string | null;
  isHome: boolean;
  gameDate: string;
  gameTime: string | null;
  location: string | null;
  teamId: string;
};

export type TrainingConfirmationPayload = {
  type: "signup" | "cancel";
  parentEmail: string;
  parentFirstName: string;
  playerName: string;
  sessionTitle: string;
  sessionDate: string;
  sessionTime: string | null;
  location: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function fmtTime(t: string | null) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return ` at ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

async function resendSend(params: { to: string; subject: string; text: string }) {
  const { Resend } = await import("resend");
  const resend = new Resend(process.env.RESEND_API_KEY);
  return resend.emails.send({
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    ...params,
  });
}

// ── Coach snack signup/cancel notification ────────────────────────────────────

export async function notifyCoachSignupChange(payload: SignupChangePayload): Promise<void> {
  const action = payload.type === "signup" ? "signed up for" : "cancelled";
  const vs = payload.opponent ? ` vs ${payload.opponent}` : "";
  const subject = `Snack update: ${payload.parentName} ${action} snacks`;
  const text = `${payload.parentName} ${action} bringing snacks for ${payload.teamName}${vs} on ${fmtDate(payload.gameDate)}.`;
  await resendSend({ to: process.env.NOTIFY_EMAIL ?? "csmall0471@gmail.com", subject, text });
}

// ── Coach training signup/cancel notification ─────────────────────────────────

export async function notifyCoachTrainingChange(payload: TrainingSignupChangePayload): Promise<void> {
  const action = payload.type === "signup" ? "registered" : "cancelled";
  const prep   = payload.type === "signup" ? "for" : "from";
  const subject = `Training update: ${payload.playerName} ${action} ${prep} ${payload.sessionTitle}`;
  const text    = `${payload.parentName} ${action} ${payload.playerName} ${prep} ${payload.sessionTitle} on ${fmtDate(payload.sessionDate)}.`;
  await resendSend({ to: process.env.NOTIFY_EMAIL ?? "csmall0471@gmail.com", subject, text });
}

// ── Parent snack confirmation ─────────────────────────────────────────────────

export async function sendSnackConfirmation(payload: SnackConfirmationPayload): Promise<void> {
  const appUrl    = process.env.APP_URL ?? "https://cssports-az.com";
  const vs        = payload.opponent ? `${payload.isHome ? "vs" : "@"} ${payload.opponent}` : "your game";
  const dateStr   = `${fmtDate(payload.gameDate)}${fmtTime(payload.gameTime)}`;
  const loc       = payload.location ? `\nLocation: ${payload.location}` : "";
  const manageUrl = `${appUrl}/parent/team/${payload.teamId}?tab=schedule`;

  const subject = payload.type === "signup"
    ? `Signed up to bring snacks — ${payload.teamName}`
    : `Snack signup cancelled — ${payload.teamName}`;
  const text = payload.type === "signup"
    ? `Hi ${payload.parentFirstName},\n\nYou're signed up to bring snacks for ${payload.teamName} ${vs} on ${dateStr}.${loc}\n\nTo cancel:\n${manageUrl}\n\nThank you!\n— Coach Connor`
    : `Hi ${payload.parentFirstName},\n\nYour snack signup for ${payload.teamName} ${vs} on ${dateStr} has been cancelled.\n\nSign up again at:\n${manageUrl}\n\nThank you!\n— Coach Connor`;

  await resendSend({ to: payload.parentEmail, subject, text });
}

// ── Parent training confirmation ──────────────────────────────────────────────

export async function sendTrainingConfirmation(payload: TrainingConfirmationPayload): Promise<void> {
  const appUrl    = process.env.APP_URL ?? "https://cssports-az.com";
  const dateStr   = `${fmtDate(payload.sessionDate)}${fmtTime(payload.sessionTime)}`;
  const loc       = payload.location ? `\nLocation: ${payload.location}` : "";
  const manageUrl = `${appUrl}/parent/training`;

  const subject = payload.type === "signup"
    ? `Registered for ${payload.sessionTitle} — ${payload.playerName}`
    : `Training registration cancelled — ${payload.sessionTitle}`;
  const text = payload.type === "signup"
    ? `Hi ${payload.parentFirstName},\n\n${payload.playerName} is now registered for ${payload.sessionTitle} on ${dateStr}.${loc}\n\nTo cancel:\n${manageUrl}\n\nSee you there!\n— Coach Connor`
    : `Hi ${payload.parentFirstName},\n\n${payload.playerName}'s registration for ${payload.sessionTitle} on ${dateStr} has been cancelled.\n\nSign up again at:\n${manageUrl}\n\nSee you there!\n— Coach Connor`;

  await resendSend({ to: payload.parentEmail, subject, text });
}

// ── Parent day-before reminder ────────────────────────────────────────────────

export async function sendSnackReminder(payload: ReminderPayload): Promise<void> {
  const vs = payload.opponent
    ? `${payload.isHome ? "vs" : "@"} ${payload.opponent}`
    : "your game";
  const dateStr = `${fmtDate(payload.gameDate)}${fmtTime(payload.gameTime)}`;
  const locationLine = payload.location
    ? `\nLocation: ${payload.location}`
    : "";

  // ── Email via Resend ──
  if (payload.reminderEmail && payload.parentEmail) {
    const subject = `Reminder: You're bringing snacks tomorrow — ${payload.teamName}`;
    const text = `Hi ${payload.parentName},\n\nJust a reminder that you signed up to bring snacks for ${payload.teamName} ${vs} on ${dateStr}.${locationLine}\n\nThank you!\n— Coach Connor`;
    await resendSend({ to: payload.parentEmail, subject, text });
  }

  // ── SMS via Twilio ──
  if (payload.reminderSms && payload.parentPhone) {
    const body = `Reminder: You're bringing snacks for ${payload.teamName} ${vs} tomorrow (${dateStr}).${locationLine} — Coach Connor`;

    // TODO: uncomment when Twilio keys are available
    // const twilio = (await import("twilio")).default;
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   from: process.env.TWILIO_FROM_NUMBER,
    //   to: payload.parentPhone,
    //   body,
    // });

    console.log("[notify:sms]", payload.parentPhone, body);
  }
}

// ── Training day-before reminder ──────────────────────────────────────────────

export async function sendTrainingReminder(payload: TrainingReminderPayload): Promise<void> {
  const dateStr = `${fmtDate(payload.sessionDate)}${fmtTime(payload.sessionTime)}`;
  const locationLine = payload.location ? `\nLocation: ${payload.location}` : "";

  // ── Email via Resend ──
  if (payload.reminderEmail && payload.parentEmail) {
    const subject = `Reminder: Training session tomorrow — ${payload.title}`;
    const text = `Hi ${payload.parentName},\n\nJust a reminder that ${payload.playerName} is registered for ${payload.title} tomorrow (${dateStr}).${locationLine}\n\nSee you there!\n— Coach Connor`;
    await resendSend({ to: payload.parentEmail, subject, text });
  }

  // ── SMS via Twilio ──
  if (payload.reminderSms && payload.parentPhone) {
    const body = `Reminder: ${payload.playerName} has training tomorrow — ${payload.title} (${dateStr}).${locationLine} — Coach Connor`;

    // TODO: uncomment when Twilio keys are available
    // const twilio = (await import("twilio")).default;
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   from: process.env.TWILIO_FROM_NUMBER,
    //   to: payload.parentPhone,
    //   body,
    // });

    console.log("[notify:sms]", payload.parentPhone, body);
  }
}
