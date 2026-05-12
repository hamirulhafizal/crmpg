/**
 * UTC month boundaries for calendar-month filters (automation preview + send dedupe).
 * Used with occurred_at / timestamps stored as timestamptz.
 */
export function utcMonthBoundsFromYearMonth0(year: number, month0: number): {
  startIso: string
  endExclusiveIso: string
} {
  const start = new Date(Date.UTC(year, month0, 1, 0, 0, 0, 0))
  const endExclusive = new Date(Date.UTC(year, month0 + 1, 1, 0, 0, 0, 0))
  return { startIso: start.toISOString(), endExclusiveIso: endExclusive.toISOString() }
}

/** Month of YYYY-MM-DD (calendar date shown in schedule UI). */
export function utcMonthBoundsForDateKey(dateKey: string): { startIso: string; endExclusiveIso: string } | null {
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(dateKey)
  if (!m) return null
  const y = Number(m[1])
  const month0 = Number(m[2]) - 1
  return utcMonthBoundsFromYearMonth0(y, month0)
}
