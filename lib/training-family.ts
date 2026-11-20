// Who a training email about one kid goes to: every parent linked to that kid
// (player_parents) who has an email, in one message — "Hi Sara and Brandon,".
// Used by the confirmation / receipt / cancellation emails and the reminder cron.

import { createServiceClient } from "@/lib/supabase/server"

export type KidParent = { first_name: string; email: string }

type EmbeddedParent = { first_name?: string | null; email?: string | null } | null | undefined

/** "Sara" · "Sara and Brandon" · "Sara, Brandon, and Alex" */
export function formatNames(names: string[]): string {
  const n = names.filter((x) => x.trim())
  if (n.length === 0) return "there"
  if (n.length === 1) return n[0]
  if (n.length === 2) return `${n[0]} and ${n[1]}`
  return `${n.slice(0, -1).join(", ")}, and ${n[n.length - 1]}`
}

/** Parents with an email, deduped by address, from `player_parents(parents(first_name, email))` rows. */
export function parentsFromEmbed(rows: Array<{ parents?: EmbeddedParent | EmbeddedParent[] }> | null | undefined): KidParent[] {
  const byEmail = new Map<string, KidParent>()
  for (const row of rows ?? []) {
    const list = Array.isArray(row.parents) ? row.parents : [row.parents]
    for (const p of list) {
      const email = p?.email?.trim()
      if (email && !byEmail.has(email.toLowerCase())) {
        byEmail.set(email.toLowerCase(), { first_name: p?.first_name?.trim() ?? "", email })
      }
    }
  }
  return [...byEmail.values()]
}

/** Every parent of the kid with an email. Service role: parents can't read player_parents. */
export async function kidParents(playerId: string): Promise<KidParent[]> {
  const { data } = await createServiceClient()
    .from("player_parents")
    .select("parents(first_name, email)")
    .eq("player_id", playerId)
  return parentsFromEmbed(data as Array<{ parents?: EmbeddedParent }> | null)
}

/**
 * Recipients + greeting. `known` is the parent the email was addressed to
 * before (whoever signed up, or the parent on the signup). The kid's other
 * parents are added only when `known` is one of them — or when there's no
 * known address (a coach add) — so a sign-up can't email a family the signer
 * doesn't belong to. `known` comes first, in the To line and the greeting.
 */
export function familyRecipients(
  known: { first_name: string | null; email: string | null } | null,
  parents: KidParent[],
): { to: string[]; greeting: string } {
  const knownEmail = known?.email?.trim() ?? ""
  const linked = !knownEmail || parents.some((p) => p.email.toLowerCase() === knownEmail.toLowerCase())
  if (!linked) return { to: [knownEmail], greeting: known?.first_name?.trim() || "there" }

  const to = new Map<string, string>()
  const names: string[] = []
  const add = (first: string | null | undefined, email: string) => {
    const k = email.toLowerCase()
    if (to.has(k)) return
    to.set(k, email)
    const n = first?.trim()
    if (n && !names.some((x) => x.toLowerCase() === n.toLowerCase())) names.push(n)
  }
  if (knownEmail) add(known?.first_name, knownEmail)
  for (const p of parents) add(p.first_name, p.email)
  return { to: [...to.values()], greeting: names.length ? formatNames(names) : known?.first_name?.trim() || "there" }
}
