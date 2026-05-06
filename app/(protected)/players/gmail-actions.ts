"use server";

import { createClient } from "@/lib/supabase/server";
import { buildEmailHtml } from "@/lib/email-template";

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
  const { data: { session } } = await supabase.auth.getSession();

  const accessToken = session?.provider_token;
  if (!accessToken) {
    return {
      error: "Gmail not connected. Sign out and sign back in with Google to grant access.",
    };
  }

  const htmlBody = buildEmailHtml({ body, teamName, organization, season });

  // Encode subject for non-ASCII safety
  const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;

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

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message: { raw: encoded } }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      return { error: "Gmail session expired. Sign out and sign back in to reconnect." };
    }
    const err = await res.json().catch(() => ({}));
    return { error: (err as any)?.error?.message ?? "Failed to create Gmail draft." };
  }

  const draft = await res.json();
  return { draftUrl: `https://mail.google.com/mail/#drafts/${draft.id}` };
}
