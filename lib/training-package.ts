// Whole-series ("package") training signup helpers, shared by the coach and
// parent pages, the server actions and the confirmation email.

/** "75" → "$75"; anything else the coach typed ("$75", "$75 + tax") as-is. */
export function fmtPackagePrice(price: string | null | undefined): string | null {
  const p = price?.trim()
  if (!p) return null
  return /^\d+(\.\d{1,2})?$/.test(p) ? `$${p}` : p
}

/** "$75 for all 10 sessions" (or "the whole series" when there's no price). */
export function packageSummary(price: string | null | undefined, sessionCount: number): string {
  const p = fmtPackagePrice(price)
  const what = sessionCount === 1 ? "1 session" : `all ${sessionCount} sessions`
  return p ? `${p} for ${what}` : `Sign up once for ${what}`
}

/** "$75" / "75" / "$1,200.50" → cents; 0 when the price isn't a plain amount. */
export function packagePriceCents(price: string | null | undefined): number {
  const p = price?.trim() ?? ""
  if (!/^\$?\s*[\d,]+(\.\d{1,2})?$/.test(p)) return 0
  const n = parseFloat(p.replace(/[$,\s]/g, ""))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** 7500 → "$75", 3750 → "$37.50". */
export function fmtCents(cents: number): string {
  return `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`
}

/** Price × kids when the price is a plain number ("$75" × 2 → "$150"), else null. */
export function packageTotal(price: string | null | undefined, kids: number): string | null {
  const cents = packagePriceCents(price) * kids
  if (!cents) return null
  return fmtCents(cents)
}

// ── Sibling pricing ──────────────────────────────────────────────────────────
// training_sessions.package_sibling_price (migration 073): what each extra kid
// from the same family pays. "50%" = that much off the series price; anything
// else ("$50", "50") = a flat price per sibling. Empty = everyone pays full.

export type SiblingRule = { kind: "percent"; pct: number } | { kind: "flat"; price: string }

export function parseSiblingPrice(sibling: string | null | undefined): SiblingRule | null {
  const t = sibling?.trim()
  if (!t) return null
  const m = t.match(/^(\d+(?:\.\d+)?)\s*%(?:\s*off)?$/i)
  if (m) {
    const pct = parseFloat(m[1])
    return pct > 0 && pct <= 100 ? { kind: "percent", pct } : null
  }
  return { kind: "flat", price: t }
}

/**
 * What the nth kid of one family pays for the series (0 = the first kid, who
 * pays full price; 1+ = siblings). "$75", "$37.50"; null when there's no price.
 */
export function packageKidPrice(
  price: string | null | undefined,
  sibling: string | null | undefined,
  nth: number,
): string | null {
  const base = fmtPackagePrice(price)
  const rule = nth > 0 ? parseSiblingPrice(sibling) : null
  if (!rule) return base
  if (rule.kind === "flat") return fmtPackagePrice(rule.price)
  const cents = packagePriceCents(price)
  if (!cents) return base ? `${base} − ${rule.pct}%` : null
  return fmtCents(Math.round((cents * (100 - rule.pct)) / 100))
}

/** True when the nth kid pays a sibling price (not the full one). */
export function isSiblingPrice(sibling: string | null | undefined, nth: number): boolean {
  return nth > 0 && !!parseSiblingPrice(sibling)
}

/**
 * Total for `adding` more kids from a family that already has `alreadyIn`
 * registered: "$112.50" for $75 + a half-off sibling. Null if any amount isn't
 * a plain number.
 */
export function packageFamilyTotal(
  price: string | null | undefined,
  sibling: string | null | undefined,
  alreadyIn: number,
  adding: number,
): string | null {
  let cents = 0
  for (let i = 0; i < adding; i++) {
    const c = packagePriceCents(packageKidPrice(price, sibling, alreadyIn + i))
    if (!c) return null
    cents += c
  }
  return cents ? fmtCents(cents) : null
}

/** "Siblings $37.50", "Siblings 50% off ($37.50)"; null when there's no sibling price. */
export function siblingSummary(price: string | null | undefined, sibling: string | null | undefined): string | null {
  const rule = parseSiblingPrice(sibling)
  if (!rule) return null
  if (rule.kind === "flat") return `Siblings ${fmtPackagePrice(rule.price)}`
  const cents = packagePriceCents(price)
  return cents
    ? `Siblings ${rule.pct}% off (${fmtCents(Math.round((cents * (100 - rule.pct)) / 100))})`
    : `Siblings ${rule.pct}% off`
}

/** Supabase error for a column that migration 071 adds — the app was deployed before it was applied. */
export function isMissingPackageColumn(message: string | undefined | null): boolean {
  return !!message && /package_(only|price)/.test(message)
}

export const PACKAGE_MIGRATION_MSG =
  "Whole-series signup needs the database update (migration 071, training_packages) applied first."

/** Supabase error for training_signups.attending (migration 072) not existing yet. */
export function isMissingAttendingColumn(message: string | undefined | null): boolean {
  return !!message && /attending/.test(message)
}

export const ATTENDANCE_MIGRATION_MSG =
  "Marking dates you'll miss needs the database update (migration 072, training_attendance) applied first."

/** Supabase error for training_sessions.package_sibling_price (migration 073) not existing yet. */
export function isMissingSiblingColumn(message: string | undefined | null): boolean {
  return !!message && /package_sibling_price/.test(message)
}

export const SIBLING_MIGRATION_MSG =
  "Sibling pricing needs the database update (migration 073, training_sibling_price) applied first."
