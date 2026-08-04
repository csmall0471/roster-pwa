import type { SupabaseClient } from "@supabase/supabase-js";

export type FamilyParent = { first_name: string; last_name: string; email: string | null };

// Every parent in a family — the given parent plus co-parents who share a kid.
// The given parent is returned first (natural greeting order). Needs a
// service-role client (inconsistent phone/email RLS matching would hide people).
export async function familyParents(service: SupabaseClient, parentId: string): Promise<FamilyParent[]> {
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

  const { data: ps } = await service
    .from("parents")
    .select("id, first_name, last_name, email")
    .in("id", ids);
  const rows = (ps ?? []) as (FamilyParent & { id: string })[];
  rows.sort((a, b) => (a.id === parentId ? -1 : b.id === parentId ? 1 : 0));
  return rows.map(({ first_name, last_name, email }) => ({ first_name, last_name, email }));
}

// Just the email addresses (used where names aren't needed).
export async function familyParentEmails(service: SupabaseClient, parentId: string): Promise<string[]> {
  return (await familyParents(service, parentId)).map((p) => p.email ?? "").filter(Boolean);
}

// The reminder's recipients (contact email + reachable co-parents, deduped) and
// the first names to greet (the reachable parents, else the contact's name).
export async function reminderFamily(
  service: SupabaseClient,
  contactName: string | null,
  contactEmail: string | null,
  parentId: string | null
): Promise<{ recipients: string[]; greetingNames: string[] }> {
  const byEmail = new Map<string, string>();
  const add = (e: string | null | undefined) => {
    const t = (e ?? "").trim();
    if (t) byEmail.set(t.toLowerCase(), t);
  };
  add(contactEmail);

  const parents = parentId ? await familyParents(service, parentId) : [];
  for (const p of parents) add(p.email);

  const names: string[] = [];
  const seenName = new Set<string>();
  const pushName = (n: string) => {
    const t = n.trim();
    const k = t.toLowerCase();
    if (t && !seenName.has(k)) {
      seenName.add(k);
      names.push(t);
    }
  };
  for (const p of parents) if ((p.email ?? "").trim()) pushName(p.first_name);
  if (names.length === 0) pushName(String(contactName ?? "").split(" ")[0]);

  return { recipients: [...byEmail.values()], greetingNames: names };
}
