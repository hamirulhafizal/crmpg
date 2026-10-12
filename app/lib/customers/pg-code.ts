/** Placeholder / empty PG codes treated as “no real PG” (Temporary accounts). */
const PLACEHOLDER_PG_CODES = new Set([
  '-',
  '—',
  '–',
  'n/a',
  'na',
  'none',
  'nil',
  '.',
  '--',
  'null',
])

/** Trim + uppercase PG code; empty string when missing/placeholder. */
export function normalizePgCodeValue(value: unknown): string {
  if (value === undefined || value === null) return ''
  const raw =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : String(value)
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (PLACEHOLDER_PG_CODES.has(trimmed.toLowerCase())) return ''
  return trimmed.toUpperCase()
}

/** True when the value is a real Public Gold PG code (not Temporary). */
export function hasRealPgCode(value: unknown): boolean {
  return Boolean(normalizePgCodeValue(value))
}
