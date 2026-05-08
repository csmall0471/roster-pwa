import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "./_components/SignOutButton";

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

  if (!isCoach) {
    // Check if already linked to a parent record
    const { data: parentLink } = await supabase
      .from("parent_auth")
      .select("parent_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (parentLink) {
      redirect("/parent");
    }

    // First sign-in: try to auto-link by matching email or phone
    let matchedId: string | null = null;

    if (user.email) {
      const { data } = await supabase
        .from("parents")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();
      matchedId = data?.id ?? null;
    }

    if (!matchedId && user.phone) {
      const { data } = await supabase.rpc("match_parent_by_phone", {
        input_phone: user.phone,
      });
      matchedId = data ?? null;
    }

    if (matchedId) {
      await supabase.from("parent_auth").insert({
        auth_user_id: user.id,
        parent_id: matchedId,
      });
      redirect("/parent");
    }

    // No matching parent record found
    redirect("/no-access");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <nav className="flex items-center gap-6">
            <Link href="/teams" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
              Teams
            </Link>
            <Link href="/players" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
              Players
            </Link>
            <Link href="/email" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800">
              Email
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">{user.email ?? user.phone}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
