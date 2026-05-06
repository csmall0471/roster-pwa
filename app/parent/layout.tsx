import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SignOutButton from "../(protected)/_components/SignOutButton";

export default async function ParentLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify they're actually a parent (not a coach who navigated here directly)
  const { data: parentLink } = await supabase
    .from("parent_auth")
    .select("parent_id, parents(first_name, last_name)")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!parentLink) redirect("/login");

  const parent = parentLink.parents as { first_name: string; last_name: string } | null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            {parent ? `${parent.first_name} ${parent.last_name}` : "Parent Portal"}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
              {user.email ?? user.phone}
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto w-full px-4 py-6">
        {children}
      </main>
    </div>
  );
}
