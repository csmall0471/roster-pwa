"use server";

import { createServiceClient } from "@/lib/supabase/server";
import { phoneKey, usPhoneE164 } from "@/lib/phone";

const NOT_RECOGNIZED =
  "We don't recognize that number. Use the phone number your coach has on file, or contact your coach.";
const CHECK_FAILED = "We couldn't check that number. Please refresh the page and try again.";
const PAGE_SIZE = 1000;

// Runs before a sign-in text goes out: only a parent on file or an invited tool
// helper may get a code. Each text costs money, so a failed check sends nothing.
// Supabase's before-user-created hook enforces the same list (migration 068) for
// anyone calling its API without going through this form.
export async function checkPhoneAccess(phone: string): Promise<{ error?: string }> {
  const e164 = usPhoneE164(phone);
  if (!e164) return { error: NOT_RECOGNIZED };
  const key = phoneKey(e164);

  const service = createServiceClient();

  const { data: helper, error: helperError } = await service
    .from("tool_access")
    .select("id")
    .eq("phone_key", key)
    .limit(1);
  if (helperError) return { error: CHECK_FAILED };
  if (helper.length > 0) return {};

  // Parent phones are stored in whatever format they were entered, so they have
  // to be normalized here rather than matched in the query.
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data: parents, error } = await service
      .from("parents")
      .select("phone")
      .not("phone", "is", null)
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) return { error: CHECK_FAILED };
    if (parents.some((p) => phoneKey(p.phone as string) === key)) return {};
    if (parents.length < PAGE_SIZE) return { error: NOT_RECOGNIZED };
  }
}
