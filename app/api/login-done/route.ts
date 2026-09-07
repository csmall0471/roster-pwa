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

      // First sign-in: auto-link this phone/email to a matching parent record so
      // deep links (e.g. a shared snack-signup link) work immediately — without
      // this, a first-time parent who lands straight on a /parent page never
      // passes through the coach layout where linking otherwise happens.
      let parentId = link?.parent_id ?? null
      if (!parentId) {
        let matchedId: string | null = null
        if (user.email) {
          const { data } = await supabase.from("parents").select("id").eq("email", user.email).maybeSingle()
          matchedId = data?.id ?? null
        }
        if (!matchedId && user.phone) {
          const { data } = await supabase.rpc("match_parent_by_phone", { input_phone: user.phone })
          matchedId = (data as string | null) ?? null
        }
        if (matchedId) {
          await supabase
            .from("parent_auth")
            .upsert({ auth_user_id: user.id, parent_id: matchedId }, { onConflict: "auth_user_id", ignoreDuplicates: true })
          parentId = matchedId
        }
      }

      if (parentId) {
        await logActivity(parentId, "login", { phone: user.phone ?? null })
        track("login").catch(() => {})
      }
    }
  } catch {
    // Never block the redirect
  }

  return NextResponse.redirect(new URL(dest, request.url))
}
