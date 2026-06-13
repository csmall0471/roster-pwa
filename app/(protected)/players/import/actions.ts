"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { phoneKey } from "@/lib/phone";

export type ImportResult = {
  imported: number;
  errors: string[];
} | null;

function parseName(fullName: string): { first: string; last: string } {
  const trimmed = fullName.trim();
  const idx = trimmed.lastIndexOf(" ");
  if (idx === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, idx).trim(), last: trimmed.slice(idx + 1).trim() };
}

export async function importPlayers(
  _prev: ImportResult,
  formData: FormData
): Promise<ImportResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { imported: 0, errors: ["Not authenticated"] };

  const raw = formData.get("tsv") as string;
  if (!raw?.trim()) return { imported: 0, errors: ["No data provided"] };

  const lines = raw
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  // Skip header row if it looks like one
  const firstLower = lines[0].toLowerCase();
  const dataLines =
    firstLower.includes("first name") || firstLower.startsWith("player")
      ? lines.slice(1)
      : lines;

  let imported = 0;
  const errors: string[] = [];

  // De-dupe parents by normalized phone OR case-insensitive email (a person
  // imported again with the phone in a different format or a re-cased/alternate
  // email must reuse the same parent, not spawn a duplicate). Prefetch once and
  // keep the maps current as new parents are created during this import.
  const { data: existingParents } = await supabase
    .from("parents")
    .select("id, email, phone")
    .eq("user_id", user.id);
  const parentByPhone = new Map<string, string>();
  const parentByEmail = new Map<string, string>();
  for (const p of existingParents ?? []) {
    const k = phoneKey(p.phone as string | null);
    if (k) parentByPhone.set(k, p.id as string);
    const e = ((p.email as string | null) ?? "").trim().toLowerCase();
    if (e) parentByEmail.set(e, p.id as string);
  }

  for (const line of dataLines) {
    const cols = line.split("\t");
    const firstName = cols[0]?.trim();
    if (!firstName) continue;

    const lastName   = cols[1]?.trim() ?? "";
    const dob        = cols[2]?.trim() ?? "";
    const grade      = cols[3]?.trim() ?? "";
    // cols[4] = team name — skip, assign via Teams page
    const shirtSize  = cols[5]?.trim() ?? "";
    const p1Name     = cols[6]?.trim() ?? "";
    const p1Phone    = cols[7]?.trim() ?? "";
    const p1Email    = cols[8]?.trim() ?? "";
    const p2Name     = cols[9]?.trim() ?? "";
    const p2Phone    = cols[10]?.trim() ?? "";
    const p2Email    = cols[11]?.trim() ?? "";

    try {
      const { data: player, error: playerErr } = await supabase
        .from("players")
        .insert({
          user_id: user.id,
          first_name: firstName,
          last_name: lastName,
          date_of_birth: dob || null,
          grade: grade || null,
          shirt_size: shirtSize || null,
        })
        .select("id")
        .single();

      if (playerErr) {
        errors.push(`${firstName} ${lastName}: ${playerErr.message}`);
        continue;
      }

      for (const [name, phone, email] of [
        [p1Name, p1Phone, p1Email],
        [p2Name, p2Phone, p2Email],
      ] as [string, string, string][]) {
        if (!name) continue;

        const { first, last } = parseName(name);
        const pKey = phoneKey(phone);
        const emailLc = (email || "").trim().toLowerCase();

        // Reuse an existing parent matched by phone or email; else create one.
        let parentId =
          (pKey && parentByPhone.get(pKey)) || (emailLc && parentByEmail.get(emailLc)) || null;

        if (!parentId) {
          const { data: newParent } = await supabase
            .from("parents")
            .insert({
              user_id: user.id,
              first_name: first,
              last_name: last,
              email: email || "",
              phone: phone || null,
            })
            .select("id")
            .single();
          parentId = newParent?.id ?? null;
          if (parentId) {
            if (pKey) parentByPhone.set(pKey, parentId);
            if (emailLc) parentByEmail.set(emailLc, parentId);
          }
        }

        if (parentId) {
          await supabase.from("player_parents").insert({
            player_id: player.id,
            parent_id: parentId,
            user_id: user.id,
            relationship: "parent",
          });
        }
      }

      imported++;
    } catch {
      errors.push(`${firstName} ${lastName}: Unexpected error`);
    }
  }

  revalidatePath("/players");
  return { imported, errors };
}
