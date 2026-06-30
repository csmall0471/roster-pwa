"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { phoneKey } from "@/lib/phone";
import { logToolActivity } from "@/lib/activity";
import { TOOLS, type ToolKey } from "@/lib/tools";

// The permission manager is owner-only. The tool_access table is locked to
// direct client access (no client policies), so reads/writes go through the
// service-role client here, gated by requireCoachOwner().
async function requireCoachOwner() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  const { count } = await supabase
    .from("teams")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);
  if ((count ?? 0) === 0) throw new Error("Not authorized");
  return { supabase, user };
}

const VALID_TOOLS = new Set<string>(TOOLS.map((t) => t.key));

export type ToolUserRow = {
  id: string;
  label: string | null;
  phone_key: string | null;
  email: string | null;
  linked: boolean;
  tools: string[];
};

// A parent the owner can pick from the add form to pre-fill name/phone/email.
export type ParentOption = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
};

export async function listParents(): Promise<ParentOption[]> {
  const { supabase, user } = await requireCoachOwner();
  const { data } = await supabase
    .from("parents")
    .select("id, first_name, last_name, email, phone")
    .eq("user_id", user.id)
    .order("first_name", { ascending: true });
  return (data ?? [])
    .map((p) => ({
      id: p.id as string,
      name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim(),
      phone: (p.phone as string | null) ?? null,
      email: (p.email as string | null) ?? null,
    }))
    // A parent we can't key on (no phone and no email) can't be granted access.
    .filter((p) => p.phone || p.email);
}

export async function listToolUsers(): Promise<ToolUserRow[]> {
  await requireCoachOwner();
  const service = createServiceClient();
  const { data } = await service
    .from("tool_access")
    .select("id, label, phone_key, email, auth_user_id, tools")
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id as string,
    label: (r.label as string | null) ?? null,
    phone_key: (r.phone_key as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    linked: !!r.auth_user_id,
    tools: ((r.tools as string[] | null) ?? []).filter((t) => VALID_TOOLS.has(t)),
  }));
}

export async function addToolUser({
  name,
  phone,
  email,
  tools,
}: {
  name: string;
  phone: string;
  email: string;
  tools: ToolKey[];
}): Promise<{ error?: string }> {
  await requireCoachOwner();

  const key = phone.trim() ? phoneKey(phone) : "";
  const cleanEmail = email.trim().toLowerCase() || null;
  if (!key && !cleanEmail) return { error: "Enter a phone number or an email." };
  if (key && key.length < 10) return { error: "Enter a valid 10-digit phone number." };

  const grant = tools.filter((t) => VALID_TOOLS.has(t));
  if (grant.length === 0) return { error: "Pick at least one tool to grant." };

  const service = createServiceClient();
  // Match by phone first (the established key), then email, so re-adding an
  // existing person updates their grants rather than erroring on the unique key.
  let existingId: string | null = null;
  if (key) {
    const { data } = await service.from("tool_access").select("id").eq("phone_key", key).maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }
  if (!existingId && cleanEmail) {
    const { data } = await service.from("tool_access").select("id").eq("email", cleanEmail).maybeSingle();
    existingId = (data?.id as string | undefined) ?? null;
  }

  if (existingId) {
    const { error } = await service
      .from("tool_access")
      .update({ label: name.trim() || null, phone_key: key || null, email: cleanEmail, tools: grant })
      .eq("id", existingId);
    if (error) return { error: error.message };
  } else {
    const { error } = await service
      .from("tool_access")
      .insert({ label: name.trim() || null, phone_key: key || null, email: cleanEmail, tools: grant });
    if (error) return { error: error.message };
  }

  void logToolActivity("tool_access_granted", { label: name.trim() || null, tools: grant });
  revalidatePath("/access");
  return {};
}

export async function setToolGrant(
  id: string,
  tool: ToolKey,
  enabled: boolean
): Promise<{ error?: string }> {
  await requireCoachOwner();
  if (!VALID_TOOLS.has(tool)) return { error: "Unknown tool." };

  const service = createServiceClient();
  const { data: row } = await service.from("tool_access").select("tools").eq("id", id).maybeSingle();
  if (!row) return { error: "User not found." };

  const current = ((row.tools as string[] | null) ?? []).filter((t) => VALID_TOOLS.has(t));
  const next = enabled
    ? Array.from(new Set([...current, tool]))
    : current.filter((t) => t !== tool);

  const { error } = await service.from("tool_access").update({ tools: next }).eq("id", id);
  if (error) return { error: error.message };

  void logToolActivity("tool_grant_changed", { id, tool, enabled });
  revalidatePath("/access");
  return {};
}

export async function removeToolUser(id: string): Promise<{ error?: string }> {
  await requireCoachOwner();
  const service = createServiceClient();
  const { error } = await service.from("tool_access").delete().eq("id", id);
  if (error) return { error: error.message };
  void logToolActivity("tool_access_revoked", { id });
  revalidatePath("/access");
  return {};
}
