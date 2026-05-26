/** Parsed calendar month (1–12) and day (1–31) from a customer `dob` value. */
export type DobMonthDay = { month: number; day: number }

/** Full calendar date from `customers.dob`. */
export type DobYmd = { year: number; month: number; day: number }

const MONTH_NAME_TO_NUM: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

/**
 * Extract month/day from `customers.dob` (year ignored).
 * Matches birthday automation and customers list filters.
 */
export function parseCustomerDobMonthDay(dob: unknown): DobMonthDay | null {
  if (!dob) return null
  const s = typeof dob === 'string' ? dob.trim() : String(dob).trim()
  if (!s) return null

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m1) {
    const month = Number(m1[2])
    const day = Number(m1[3])
    if (!Number.isFinite(month) || !Number.isFinite(day)) return null
    return { month, day }
  }

  const m2 = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/)
  if (m2) {
    const monthName = String(m2[1]).toLowerCase()
    const day = Number(m2[2])
    const month = MONTH_NAME_TO_NUM[monthName]
    if (!month || !Number.isFinite(day)) return null
    return { month, day }
  }

  return null
}

/** Parse full birth date (year included) from `customers.dob`. */
export function parseCustomerDobYmd(dob: unknown): DobYmd | null {
  if (!dob) return null
  const s = typeof dob === 'string' ? dob.trim() : String(dob).trim()
  if (!s) return null

  const m1 = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m1) {
    const year = Number(m1[1])
    const month = Number(m1[2])
    const day = Number(m1[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return { year, month, day }
  }

  const m2 = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/)
  if (m2) {
    const month = MONTH_NAME_TO_NUM[String(m2[1]).toLowerCase()]
    const day = Number(m2[2])
    const year = Number(m2[3])
    if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null
    return { year, month, day }
  }

  const m3 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m3) {
    const day = Number(m3[1])
    const month = Number(m3[2])
    const year = Number(m3[3])
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
    return { year, month, day }
  }

  return null
}

/**
 * Age in full years on Malaysia “today”, using birthday rule (not yet had birthday this year → minus 1).
 */
export function computeAgeFromDob(dob: unknown, now: Date = new Date()): number | null {
  const birth = parseCustomerDobYmd(dob)
  if (!birth) return null

  const [refY, refM, refD] = getMalaysiaTodayYmd(now).split('-').map(Number)
  let age = refY - birth.year
  if (refM < birth.month || (refM === birth.month && refD < birth.day)) {
    age -= 1
  }
  if (!Number.isFinite(age) || age < 0 || age > 150) return null
  return age
}

/** Prefer live age from DOB; fall back to stored `age` when DOB is missing. */
export function displayCustomerAge(
  dob: unknown,
  storedAge: number | string | null | undefined,
  now: Date = new Date()
): number | null {
  const fromDob = computeAgeFromDob(dob, now)
  if (fromDob != null) return fromDob
  if (storedAge === null || storedAge === undefined || storedAge === '') return null
  const n = typeof storedAge === 'number' ? storedAge : Number(String(storedAge).trim())
  return Number.isFinite(n) ? n : null
}

const MALAYSIA_TZ = 'Asia/Kuala_Lumpur'

/** Calendar month (1–12) and day (1–31) in Malaysia for “today”. */
export function getMalaysiaTodayMonthDay(now: Date = new Date()): DobMonthDay {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TZ,
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(now)
  const month = Number(parts.find((p) => p.type === 'month')?.value)
  const day = Number(parts.find((p) => p.type === 'day')?.value)
  if (!Number.isFinite(month) || !Number.isFinite(day)) {
    const MALAYSIA_OFFSET_MINUTES = 8 * 60
    const local = new Date(now.getTime() + MALAYSIA_OFFSET_MINUTES * 60 * 1000)
    return { month: local.getUTCMonth() + 1, day: local.getUTCDate() }
  }
  return { month, day }
}

/** ISO date `YYYY-MM-DD` for Malaysia civil “today”. */
export function getMalaysiaTodayYmd(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value
  const month = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (year && month && day) return `${year}-${month}-${day}`
  const { month: m, day: d } = getMalaysiaTodayMonthDay(now)
  const y = now.getUTCFullYear()
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** True when customer DOB month/day equals Malaysia “today” (year ignored). */
export function customerDobIsToday(dob: unknown, now: Date = new Date()): boolean {
  const parsed = parseCustomerDobMonthDay(dob)
  if (!parsed) return false
  const today = getMalaysiaTodayMonthDay(now)
  return parsed.month === today.month && parsed.day === today.day
}

export function customerDobMatchesMonthDayFilter(
  dob: unknown,
  month: number | null | undefined,
  dayFrom: number | null | undefined,
  dayTo: number | null | undefined
): boolean {
  if (month == null || month < 1 || month > 12) return true
  const parsed = parseCustomerDobMonthDay(dob)
  if (!parsed) return false
  if (parsed.month !== month) return false
  const from = dayFrom != null && dayFrom >= 1 ? dayFrom : 1
  const to = dayTo != null && dayTo >= 1 ? dayTo : 31
  return parsed.day >= from && parsed.day <= to
}
