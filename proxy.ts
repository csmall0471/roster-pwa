import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session on every request so the JWT stays current.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (user && !pathname.startsWith("/api/cron")) {
    console.log(JSON.stringify({
      uid:   user.id,
      phone: user.phone ?? null,
      path:  pathname,
    }));
  }

  // Unauthenticated → login (allow the auth callback through). Roster-tool deep
  // links go to the roster admin login (no family features); everything else to
  // the family login.
  if (!user && pathname !== "/" && pathname !== "/login" && pathname !== "/roster-login" && pathname !== "/admin" && !pathname.startsWith("/auth") && !pathname.startsWith("/api/cron") && !pathname.startsWith("/event/") && pathname !== "/privacy" && pathname !== "/sms-terms" && pathname !== "/sms-opt-in" && pathname !== "/no-access" && pathname !== "/house") {
    const url = request.nextUrl.clone();
    url.pathname = pathname.startsWith("/tools/roster-creator") ? "/roster-login" : "/login";
    url.searchParams.set("next", pathname + (request.nextUrl.search ?? ""));
    return NextResponse.redirect(url);
  }

  // Already authenticated → skip the login pages
  if (user && (pathname === "/login" || pathname === "/roster-login" || pathname === "/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/teams";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|sw.js|workbox-.*\\.js).*)",
  ],
};
