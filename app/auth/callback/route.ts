import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/teams";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Stash Google's refresh token (only handed to us here) so Gmail access can
      // be renewed later without forcing a re-login. Present only when the sign-in
      // requested offline access + consent.
      const refreshToken = data.session?.provider_refresh_token;
      const userId = data.session?.user.id;
      if (refreshToken && userId) {
        await supabase
          .from("google_oauth_tokens")
          .upsert({ user_id: userId, refresh_token: refreshToken, updated_at: new Date().toISOString() });
      }
      const url = request.nextUrl.clone();
      url.pathname = next;
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Exchange failed — redirect to login with error hint
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("error", "auth_callback_failed");
  return NextResponse.redirect(url);
}
