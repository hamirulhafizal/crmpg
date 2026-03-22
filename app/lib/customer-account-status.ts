/**
 * Shared rules for G100-style account status using Supabase `customers` columns first
 * (`pg_code`, `created_at`, `last_purchase_at`, `is_monthly_buyer`), with fallbacks to
 * `original_data` (Excel JSON) for legacy rows.
 */

export type AccountStatusKey =
  | 'temporary'
  | 'freeze'
  | 'active'
  | 'free'
  | 'inactive'
  | 'unknown'

/** Row shape needed for status (matches customers table + optional JSON fallbacks). */
export type CustomerAccountStatusInput = {
  pg_code?: string | null
  created_at?: string | null
  original_data?: unknown
  last_purchase_at?: string | null
  is_monthly_buyer?: boolean | null
}

const FREE_LEGACY_HINT = 'no sales transaction within a year'
/** Freeze segment: registration from 2020 onward (per G100 infographic). */
const FREEZE_REGISTRATION_MIN_UTC = Date.UTC(2020, 0, 1)
/** Month boundaries for “current month” follow Malaysia time (PG operations). */
const MALAYSIA_TZ = 'Asia/Kuala_Lumpur'

/** Calendar year + month (1–12) in Malaysia for a UTC timestamp. */
function getMalaysiaCalendarYearMonth(ms: number): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TZ,
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(new Date(ms))
  const year = Number(parts.find((p) => p.type === 'year')?.value)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    const d = new Date(ms)
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  }
  return { year, month }
}

/** True if last purchase falls in the same Malaysia calendar month as “now”. */
function isLastPurchaseInCurrentMalaysiaMonth(lastMs: number, nowMs: number): boolean {
  const a = getMalaysiaCalendarYearMonth(lastMs)
  const b = getMalaysiaCalendarYearMonth(nowMs)
  return a.year === b.year && a.month === b.month
}

/** Gap from last purchase to “now” exceeds one calendar year (365 days). */
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000
/** “Lebih 3 bulan” tanpa beli — ~90 hari (bukan termasuk tepat hari ke-90). */
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000

function isMoreThanOneYearSinceLastPurchase(lastMs: number, nowMs: number): boolean {
  return nowMs - lastMs > ONE_YEAR_MS
}

function isMoreThanThreeMonthsSinceLastPurchase(lastMs: number, nowMs: number): boolean {
  return nowMs - lastMs > THREE_MONTHS_MS
}

export function toAccountStatusInput(input: unknown): CustomerAccountStatusInput {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const o = input as Record<string, unknown>
    if (
      'original_data' in o ||
      'pg_code' in o ||
      'created_at' in o ||
      'last_purchase_at' in o ||
      'is_monthly_buyer' in o
    ) {
      return {
        pg_code: o.pg_code as string | null | undefined,
        created_at: o.created_at as string | undefined,
        original_data: o.original_data,
        last_purchase_at: o.last_purchase_at as string | null | undefined,
        is_monthly_buyer: o.is_monthly_buyer as boolean | null | undefined,
      }
    }
  }
  return { original_data: input }
}

/** Values that mean “no PG code” in imports (avoid classifying as Temporary incorrectly). */
function isPlaceholderPgCode(s: string): boolean {
  const t = s.trim().toLowerCase()
  if (!t) return true
  return ['-', '—', '–', 'n/a', 'na', 'none', 'nil', '.', '--', 'null'].includes(t)
}

/**
 * Non-empty PG code from the row column first, then common `original_data` keys.
 * Temporary account applies only when this returns '' (no real PG code).
 */
function normalizePgCodeFromRow(row: CustomerAccountStatusInput): string {
  const c = row.pg_code
  if (typeof c === 'number' && Number.isFinite(c)) {
    const s = String(c).trim()
    if (s && !isPlaceholderPgCode(s)) return s
  }
  if (typeof c === 'string' && c.trim()) {
    const s = c.trim()
    if (!isPlaceholderPgCode(s)) return s
  }

  const data = normalizeCustomerOriginalData(row.original_data)
  const candidates = [
    data?.['PG Code'],
    data?.['PGCode'],
    data?.['PG code'],
    data?.['pg_code'],
    data?.['pgCode'],
  ]
  for (const raw of candidates) {
    if (raw === undefined || raw === null) continue
    const s = typeof raw === 'number' && Number.isFinite(raw) ? String(raw).trim() : String(raw).trim()
    if (s && !isPlaceholderPgCode(s)) return s
  }
  return ''
}

function lastPurchaseRawFromRow(row: CustomerAccountStatusInput): unknown {
  const data = normalizeCustomerOriginalData(row.original_data)
  return data?.['Last Purchase Date']
}

function isLegacyFreeHint(raw: unknown): boolean {
  if (typeof raw !== 'string') return false
  return raw.trim().toLowerCase().includes(FREE_LEGACY_HINT)
}

function getLastPurchaseMsFromRow(row: CustomerAccountStatusInput): number | null {
  if (row.last_purchase_at) {
    const t = new Date(row.last_purchase_at).getTime()
    if (Number.isFinite(t)) return t
  }
  const raw = lastPurchaseRawFromRow(row)
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'string' && isLegacyFreeHint(raw)) return null

  return parseOriginalDateToUTC(raw)
}

function getRegistrationMsForFreeze(row: CustomerAccountStatusInput): number | null {
  const data = normalizeCustomerOriginalData(row.original_data)
  const reg = data?.['Date Register']
  if (typeof reg === 'string' && reg.trim()) {
    const ms = parseFlexibleDateToUtcMs(reg)
    if (ms != null) return ms
  }
  if (row.created_at) {
    const t = new Date(row.created_at).getTime()
    if (Number.isFinite(t)) return t
  }
  return null
}

export function normalizeCustomerOriginalData(
  originalData: unknown
): Record<string, unknown> | null {
  if (originalData == null) return null
  if (typeof originalData === 'object' && !Array.isArray(originalData)) {
    return originalData as Record<string, unknown>
  }
  if (typeof originalData === 'string') {
    const s = originalData.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

export function parseOriginalDateToUTC(value: unknown): number | null {
  if (!value) return null
  if (typeof value !== 'string') return null

  const s = value.trim()
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
  )
  if (!m) {
    const t = new Date(s).getTime()
    return Number.isFinite(t) ? t : null
  }

  const [, y, mo, d, h, mi, sec] = m
  const t = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(sec)
  )
  return Number.isFinite(t) ? t : null
}

/** `YYYY-MM-DD` → UTC midnight timestamp */
export function parseDateOnlyToUTC(value: string): number | null {
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  const [, y, mo, d] = m
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  return Number.isFinite(t) ? t : null
}

export function parseFlexibleDateToUtcMs(value: string): number | null {
  const trimmed = value.trim()
  const dateOnly = parseDateOnlyToUTC(trimmed)
  if (dateOnly != null) return dateOnly
  return parseOriginalDateToUTC(trimmed)
}

/**
 * G100-style status from the customer row (Supabase columns first, then original_data).
 *
 * - Temporary: **no** PG code (Prospect).
 * - **Free account**: ada PG code, **lebih 12 bulan** tak beli (`now - lastPurchase > 365 hari`).
 *   Legacy Excel “no sales within a year” → `free` juga.
 * - **Freeze account**: ada PG code, **lebih 3 bulan** tak beli tetapi **bukan** Free (≤ 12 bulan
 *   sejak last beli, iaitu antara ~90 hari dan 1 tahun). Tiada rekod beli lama + daftar 2020+ → freeze.
 * - **Inactive / Active**: dalam ~3 bulan terakhir ada tarikh beli: tiada belian bulan semasa MY
 *   atau bukan pembeli bulanan → inactive; pembeli bulanan + bulan semasa → active.
 */
export function getAccountStatusKey(input: unknown): AccountStatusKey {
  const row = toAccountStatusInput(input)
  const pg = normalizePgCodeFromRow(row)
  const rawLp = lastPurchaseRawFromRow(row)

  // No real PG code (e.g. column `"-"`) → Temporary first. Prospect rows may still carry a default
  // "No Sales Transaction within a year" line; that must not override Temporary.
  if (!pg) return 'temporary'

  const legacyFree = typeof rawLp === 'string' && isLegacyFreeHint(rawLp)
  if (legacyFree) return 'free'

  const lastMs = getLastPurchaseMsFromRow(row)
  const monthly = row.is_monthly_buyer === true

  if (lastMs == null) {
    const regMs = getRegistrationMsForFreeze(row)
    if (regMs != null && regMs >= FREEZE_REGISTRATION_MIN_UTC) return 'freeze'
    return 'unknown'
  }

  const now = Date.now()

  // Free: lebih 12 bulan tak beli (perlu semak sebelum Freeze > 3 bulan).
  if (isMoreThanOneYearSinceLastPurchase(lastMs, now)) return 'free'

  // Freeze: lebih 3 bulan tak beli tetapi masih dalam tempoh ≤ 12 bulan dari last beli.
  if (isMoreThanThreeMonthsSinceLastPurchase(lastMs, now)) return 'freeze'

  // Dalam ~3 bulan terakhir ada belian: Inactive / Active (bulan semasa Malaysia).
  if (!isLastPurchaseInCurrentMalaysiaMonth(lastMs, now)) return 'inactive'

  if (monthly) return 'active'

  return 'inactive'
}

/** UI labels for the customers table and edit form. */
export function getAccountStatusLabel(input: unknown): string {
  const key = getAccountStatusKey(input)
  switch (key) {
    case 'temporary':
      return 'Temporary account'
    case 'freeze':
      return 'Freeze account'
    case 'active':
      return 'Active account'
    case 'free':
      return 'Free account'
    case 'inactive':
      return 'Inactive account'
    default:
      return 'Unknown'
  }
}

export function getLastPurchaseUtcMonthDate(originalData: unknown): {
  month: number
  day: number
} | null {
  const row = toAccountStatusInput(originalData)
  const ms = getLastPurchaseMsFromRow(row)
  if (ms == null) return null
  const d = new Date(ms)
  return { month: d.getUTCMonth(), day: d.getUTCDate() }
}

export function getLastPurchaseUtcYmd(originalData: unknown): string | null {
  const row = toAccountStatusInput(originalData)
  const ms = getLastPurchaseMsFromRow(row)
  if (ms == null) return null
  return new Date(ms).toISOString().slice(0, 10)
}

export function getRegistrationUtcMonthDate(
  originalData: unknown,
  createdAt: string | null | undefined
): { month: number; day: number } | null {
  const data = normalizeCustomerOriginalData(originalData)
  const reg = data?.['Date Register']
  if (typeof reg === 'string' && reg.trim()) {
    const ms = parseFlexibleDateToUtcMs(reg)
    if (ms != null) {
      const d = new Date(ms)
      return { month: d.getUTCMonth(), day: d.getUTCDate() }
    }
  }
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      return { month: d.getUTCMonth(), day: d.getUTCDate() }
    }
  }
  return null
}

export function getRegistrationUtcYmd(
  originalData: unknown,
  createdAt: string | null | undefined
): string | null {
  const data = normalizeCustomerOriginalData(originalData)
  const reg = data?.['Date Register']
  if (typeof reg === 'string' && reg.trim()) {
    const ms = parseFlexibleDateToUtcMs(reg)
    if (ms != null) {
      return new Date(ms).toISOString().slice(0, 10)
    }
  }
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
  }
  return null
}

export function formatLastPurchaseForTemplate(originalData: unknown): string {
  const row = toAccountStatusInput(originalData)
  if (row.last_purchase_at) {
    const d = new Date(row.last_purchase_at)
    if (Number.isFinite(d.getTime())) return d.toISOString().slice(0, 10)
  }
  const data = normalizeCustomerOriginalData(row.original_data)
  const raw = data?.['Last Purchase Date']
  if (raw === undefined || raw === null) return ''
  return typeof raw === 'string' ? raw : String(raw)
}

/** Table cell: prefer `last_purchase_at`, else legacy Excel string; `DD/MM/YYYY` when parsable ISO. */
export function formatLastPurchaseDisplayForUi(input: unknown): string {
  const row = toAccountStatusInput(input)
  if (row.last_purchase_at) {
    const d = new Date(row.last_purchase_at)
    if (Number.isFinite(d.getTime())) {
      const dd = String(d.getUTCDate()).padStart(2, '0')
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
      const yyyy = d.getUTCFullYear()
      return `${dd}/${mm}/${yyyy}`
    }
  }
  const raw = lastPurchaseRawFromRow(row)
  if (raw === undefined || raw === null || raw === '') return '-'
  if (typeof raw === 'string') return raw.trim() || '-'
  return String(raw)
}

export function formatRegistrationForTemplate(
  originalData: unknown,
  createdAt: string | null | undefined
): string {
  const data = normalizeCustomerOriginalData(originalData)
  const reg = data?.['Date Register']
  if (typeof reg === 'string' && reg.trim()) return reg.trim()
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10)
    }
  }
  return ''
}
