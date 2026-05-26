import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logActivity } from "@/lib/activity"
import { track } from "@vercel/analytics/server"

export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next")
  const dest = next && next.startsWith("/") ? next : "/parent/dashboard"

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: link } = await supabase
        .from("parent_auth")
        .select("parent_id")
        .eq("auth_user_id", user.id)
        .maybeSingle()
      if (link) {
        await logActivity(link.parent_id, "login", { phone: user.phone ?? null })
        track("login").catch(() => {})
      }
    }
  } catch {
    // Never block the redirect
  }

  return NextResponse.redirect(new URL(dest, request.url))
}
