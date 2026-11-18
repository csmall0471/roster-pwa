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

/** Price × kids when the price is a plain number ("$75" × 2 → "$150"), else null. */
export function packageTotal(price: string | null | undefined, kids: number): string | null {
  const cents = packagePriceCents(price) * kids
  if (!cents) return null
  return `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}`
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
