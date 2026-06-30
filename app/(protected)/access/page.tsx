import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listToolUsers, listParents } from "./actions";
import AccessManager from "./AccessManager";

// Owner-only permission manager: grant specific tools to specific people
// (phone-invited helpers and existing parents). Non-owners never reach here —
// scoped helpers are pinned to their tools and parents to /parent — but we
// re-check ownership defensively since this exposes the access list.
export default async function AccessPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) === 0) redirect("/teams");

  const [users, parents] = await Promise.all([listToolUsers(), listParents()]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Tool access</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Grant specific tools to specific people. They sign in with a text code (or the email you list) and
          see only what you&rsquo;ve granted — never your other coach screens.
        </p>
      </div>
      <AccessManager users={users} parents={parents} />
    </div>
  );
}
