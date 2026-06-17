"use server";

import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";
import { freshGoogleAccessToken } from "@/lib/google";

export async function createGmailDraft({
  bcc,
  subject,
  body,
  teamName,
  organization,
  season,
}: {
  bcc: string[];
  subject: string;
  body: string;
  teamName?: string;
  organization?: string | null;
  season?: string | null;
}): Promise<{ draftUrl: string } | { error: string }> {
  const supabase = await createClient();

  // Prefer the access token from the live session (present right after login);
  // otherwise mint a fresh one from the stored refresh token. This is what keeps
  // Gmail working past the ~1h access-token expiry without a re-login.
  const { data: { session } } = await supabase.auth.getSession();
  let accessToken = session?.provider_token ?? (await freshGoogleAccessToken(supabase));
  if (!accessToken) {
    return {
      error: "Gmail not connected. Use Staff sign-in (Google) to grant access — once reconnected it stays connected.",
    };
  }

  const htmlBody = buildEmailHtml({ body, teamName, organization, season });
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`; // non-ASCII safe
  const raw = [
    `To: `,
    `Bcc: ${bcc.join(", ")}`,
    `Subject: ${encodedSubject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/html; charset=UTF-8`,
    ``,
    htmlBody,
  ].join("\r\n");
  const encoded = Buffer.from(raw).toString("base64url");

  const postDraft = (token: string) =>
    fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { raw: encoded } }),
    });

  let res = await postDraft(accessToken);
  // Stale session token → refresh from the stored refresh token and retry once.
  if (res.status === 401) {
    const refreshed = await freshGoogleAccessToken(supabase);
    if (refreshed && refreshed !== accessToken) {
      accessToken = refreshed;
      res = await postDraft(refreshed);
    }
  }

  if (!res.ok) {
    if (res.status === 401) {
      return { error: "Gmail session expired. Use Staff sign-in (Google) to reconnect." };
    }
    const err = await res.json().catch(() => ({}));
    return { error: (err as { error?: { message?: string } })?.error?.message ?? "Failed to create Gmail draft." };
  }

  const draft = await res.json();
  return { draftUrl: `https://mail.google.com/mail/#drafts/${draft.id}` };
}
