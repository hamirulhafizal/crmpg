/**
 * Shared rules for account status (inactive / free / active) from Excel `original_data`,
 * plus helpers for follow-up anniversary matching.
 */

export type AccountStatusKey = 'inactive' | 'free' | 'active' | 'unknown'

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

export function getAccountStatusKey(originalData: unknown): AccountStatusKey {
  const data = normalizeCustomerOriginalData(originalData)
  const raw = data?.['Last Purchase Date']
  if (raw === undefined || raw === null || raw === '') return 'unknown'

  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase()
    if (s.includes('no sales transaction within a year')) return 'free'
  }

  const lastPurchaseMs = parseOriginalDateToUTC(raw)
  if (!lastPurchaseMs) return 'unknown'

  const oneYearMs = 365 * 24 * 60 * 60 * 1000
  if (Date.now() - lastPurchaseMs > oneYearMs) return 'inactive'
  return 'active'
}

export function getLastPurchaseUtcMonthDate(originalData: unknown): {
  month: number
  day: number
} | null {
  const data = normalizeCustomerOriginalData(originalData)
  const raw = data?.['Last Purchase Date']
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'string' && raw.trim().toLowerCase().includes('no sales transaction within a year')) {
    return null
  }
  const ms = typeof raw === 'string' ? parseFlexibleDateToUtcMs(raw) : null
  if (ms == null) return null
  const d = new Date(ms)
  return { month: d.getUTCMonth(), day: d.getUTCDate() }
}

export function getLastPurchaseUtcYmd(originalData: unknown): string | null {
  const data = normalizeCustomerOriginalData(originalData)
  const raw = data?.['Last Purchase Date']
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw === 'string' && raw.trim().toLowerCase().includes('no sales transaction within a year')) {
    return null
  }
  const ms = typeof raw === 'string' ? parseFlexibleDateToUtcMs(raw) : null
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
  const data = normalizeCustomerOriginalData(originalData)
  const raw = data?.['Last Purchase Date']
  if (raw === undefined || raw === null) return ''
  return typeof raw === 'string' ? raw : String(raw)
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
