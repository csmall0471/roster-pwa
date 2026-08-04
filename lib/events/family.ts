import type { SupabaseClient } from "@supabase/supabase-js";

// Every email address in a parent's family — the parent plus co-parents who
// share a kid — so a family email reaches both parents in one send. Needs a
// service-role client (inconsistent phone/email RLS matching would hide people).
export async function familyParentEmails(service: SupabaseClient, parentId: string): Promise<string[]> {
  const { data: mine } = await service
    .from("player_parents")
    .select("player_id")
    .eq("parent_id", parentId);
  const playerIds = [...new Set((mine ?? []).map((r) => r.player_id as string))];

  let ids = [parentId];
  if (playerIds.length) {
    const { data: co } = await service
      .from("player_parents")
      .select("parent_id")
      .in("player_id", playerIds);
    ids = [...new Set([parentId, ...((co ?? []).map((r) => r.parent_id as string))])];
  }

  const { data: ps } = await service.from("parents").select("email").in("id", ids);
  return ((ps ?? []) as { email: string | null }[]).map((p) => p.email ?? "").filter(Boolean);
}
