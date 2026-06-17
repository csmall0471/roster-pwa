import type { SupabaseClient } from "@supabase/supabase-js";

// Mint a fresh Google access token for the current user by exchanging their stored
// refresh token (captured at the OAuth callback). Returns null if we have no creds,
// no stored token, or Google rejects it (e.g. access revoked) — callers then surface
// a "reconnect" message. Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (the same
// OAuth client configured in Supabase's Google provider).
export async function freshGoogleAccessToken(supabase: SupabaseClient): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("google_oauth_tokens")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();
  const refreshToken = (data?.refresh_token as string | undefined) ?? null;
  if (!refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return null; // invalid_grant (revoked/expired) etc.
    const json = (await res.json()) as { access_token?: string };
    return json.access_token ?? null;
  } catch {
    return null;
  }
}
