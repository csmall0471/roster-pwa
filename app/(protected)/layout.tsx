import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TOOLS, type ToolDef } from "@/lib/tools";
import SignOutButton from "./_components/SignOutButton";
import ToolsNav from "./_components/ToolsNav";
import ThemeToggle from "./_components/ThemeToggle";
import ScopedAdminGuard from "./_components/ScopedAdminGuard";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Check if this user is the coach (owns at least one team)
  const { count: teamCount } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  const isCoach = (teamCount ?? 0) > 0;

  // Non-coaches can still be granted specific tools (the permission manager).
  // A grant to a tools-area tool (e.g. Roster Creator, which has no Parent
  // Portal home) gives a scoped helper view; otherwise parents fall through to
  // the Parent Portal, where parent-capable tools (Card Creator) show as tabs.
  let scopedLabel: string | null = null;
  let scopedTools: ToolDef[] = [];

  if (!isCoach) {
    // Link this phone/email-authed user to any matching access-list row, then
    // read their granted tools.
    const { data: granted } = await supabase.rpc("link_tool_access");
    const grantedKeys = new Set<string>((granted as string[] | null) ?? []);
    const myTools = TOOLS.filter((t) => grantedKeys.has(t.key));
    const hasToolsAreaGrant = myTools.some((t) => t.parentHref === null);

    if (!hasToolsAreaGrant) {
      // No tools-area grant — try the parent flow first.
      const { data: parentLink } = await supabase
        .from("parent_auth")
        .select("parent_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();
      if (parentLink) redirect("/parent");

      // First sign-in: try to auto-link by matching email or phone.
      let matchedId: string | null = null;
      if (user.email) {
        const { data } = await supabase.from("parents").select("id").eq("email", user.email).maybeSingle();
        matchedId = data?.id ?? null;
      }
      if (!matchedId && user.phone) {
        const { data } = await supabase.rpc("match_parent_by_phone", { input_phone: user.phone });
        matchedId = data ?? null;
      }
      if (matchedId) {
        await supabase.from("parent_auth").insert({ auth_user_id: user.id, parent_id: matchedId });
        redirect("/parent");
      }

      // Not a parent — and no parent-capable grant either → no access.
      if (myTools.length === 0) redirect("/no-access");
    }

    // Scoped helper: hold them to exactly their granted tools.
    scopedTools = myTools;
    // Resolve the name the owner gave them, for the header.
    const { data: labels } = await supabase.rpc("roster_admin_labels");
    const mine = ((labels ?? []) as { auth_user_id: string; label: string | null }[]).find(
      (r) => r.auth_user_id === user.id
    );
    scopedLabel = mine?.label?.trim() || null;
  }

  const scopedAdmin = scopedTools.length > 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-[1600px] mx-auto px-4 h-14 flex items-center justify-between">
          <nav className="flex items-center gap-6">
            {scopedAdmin ? (
              scopedTools.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800"
                >
                  {t.label}
                </Link>
              ))
            ) : (
              <>
                <Link href="/teams" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Teams
                </Link>
                <Link href="/players" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Players
                </Link>
                <Link href="/email" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Email
                </Link>
                <Link href="/training" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Training
                </Link>
                <Link href="/training/skills" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Skills
                </Link>
                <Link href="/events" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Events
                </Link>
                <Link href="/preview" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Preview
                </Link>
                <Link href="/activity" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
                  Activity
                </Link>
                <ToolsNav />
              </>
            )}
          </nav>
          <div className="flex items-center gap-3">
            {scopedAdmin ? (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Signed in as <span className="font-semibold text-gray-700 dark:text-gray-200">{scopedLabel ?? user.phone ?? user.email}</span>
              </span>
            ) : (
              <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{user.email ?? user.phone}</span>
            )}
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </header>

      {scopedAdmin && <ScopedAdminGuard allowedPaths={scopedTools.map((t) => t.href)} />}

      <main className="flex-1 max-w-[1600px] mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
