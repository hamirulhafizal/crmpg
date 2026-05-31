export type AnalyticsPeriod = 'this_month' | 'last_30_days' | 'all_time' | 'custom'

export type GapLeadRow = {
  id: string
  userId: string
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
  locationCity: string
  icNumber: string | null
  submittedAt: string
  originalData: Record<string, unknown>
  segmentAttributes: Record<string, unknown>
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** True for leads created via public GAP registration form (/api/submit-form). */
export function isGapFormLead(originalData: unknown, segmentAttributes: unknown): boolean {
  const data = asRecord(originalData)
  const source = String(data.Source ?? data.source ?? '').trim().toLowerCase()
  if (source.includes('gap registration')) return true
  if (String(data['Import Source'] ?? '').trim().toLowerCase() === 'gmail_mbox') return true

  const seg = asRecord(segmentAttributes)
  const hasGapSubmitMarker = Boolean(data['Submitted At'] && data['Dealer Email'])
  return (
    seg.source === 'google_ads' &&
    seg.acquisition_source === 'google_ads' &&
    hasGapSubmitMarker
  )
}

export type GapCustomerRow = {
  id: string
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
  created_at: string | null
  original_data: unknown
  segment_attributes: unknown
}

/** Supabase PostgREST filter for rows that are likely GAP leads (avoids 1000-row cap on all customers). */
export const GAP_CUSTOMER_OR_FILTER =
  'original_data->>Source.ilike.%GAP registration%,original_data->>Import Source.eq.gmail_mbox'

export async function fetchGapCustomerRows(
  admin: import('@supabase/supabase-js').SupabaseClient,
  userIds: string[]
): Promise<GapCustomerRow[]> {
  if (userIds.length === 0) return []

  const pageSize = 1000
  const rows: GapCustomerRow[] = []
  let offset = 0

  while (true) {
    const { data, error } = await admin
      .from('customers')
      .select('id, user_id, name, email, phone, location, created_at, original_data, segment_attributes')
      .in('user_id', userIds)
      .or(GAP_CUSTOMER_OR_FILTER)
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = (data || []) as GapCustomerRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  return rows
}

export function locationCityFromRaw(location: string | null | undefined): string {
  if (!location?.trim()) return 'Unknown'
  const city = location.split(',')[0]?.trim()
  return city || 'Unknown'
}

export function gapLeadSubmittedAt(originalData: unknown, createdAt: string | null | undefined): string {
  const data = asRecord(originalData)
  const raw = data['Submitted At']
  if (typeof raw === 'string' && raw.trim()) {
    const d = new Date(raw)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  if (createdAt) {
    const d = new Date(createdAt)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return new Date(0).toISOString()
}

export function gapLeadIcNumber(originalData: unknown): string | null {
  const data = asRecord(originalData)
  const ic = data['IC Number']
  if (typeof ic === 'string' && ic.trim()) return ic.trim()
  if (ic != null) return String(ic)
  return null
}

export function resolveAnalyticsDateRange(
  period: AnalyticsPeriod,
  fromRaw?: string | null,
  toRaw?: string | null
): { start: Date | null; end: Date | null; label: string } {
  const now = new Date()
  const end = new Date(now)
  end.setHours(23, 59, 59, 999)

  if (period === 'all_time') {
    return { start: null, end: null, label: 'All time' }
  }

  if (period === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    start.setHours(0, 0, 0, 0)
    return { start, end, label: 'This month' }
  }

  if (period === 'last_30_days') {
    const start = new Date(now)
    start.setDate(start.getDate() - 30)
    start.setHours(0, 0, 0, 0)
    return { start, end, label: 'Last 30 days' }
  }

  const from = fromRaw ? new Date(fromRaw) : null
  const to = toRaw ? new Date(toRaw) : null
  if (from && !Number.isNaN(from.getTime())) from.setHours(0, 0, 0, 0)
  if (to && !Number.isNaN(to.getTime())) to.setHours(23, 59, 59, 999)

  const start = from && !Number.isNaN(from.getTime()) ? from : null
  const endCustom = to && !Number.isNaN(to.getTime()) ? to : end
  const label =
    start && endCustom
      ? `${start.toLocaleDateString('en-MY')} – ${endCustom.toLocaleDateString('en-MY')}`
      : 'Custom range'

  return { start, end: endCustom, label }
}

export function leadWithinRange(submittedAtIso: string, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true
  const t = new Date(submittedAtIso).getTime()
  if (Number.isNaN(t)) return false
  if (start && t < start.getTime()) return false
  if (end && t > end.getTime()) return false
  return true
}

export function customerToGapLead(row: {
  id: string
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  location: string | null
  created_at: string | null
  original_data: unknown
  segment_attributes: unknown
}): GapLeadRow | null {
  if (!isGapFormLead(row.original_data, row.segment_attributes)) return null
  const submittedAt = gapLeadSubmittedAt(row.original_data, row.created_at)
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    location: row.location,
    locationCity: locationCityFromRaw(row.location),
    icNumber: gapLeadIcNumber(row.original_data),
    submittedAt,
    originalData: asRecord(row.original_data),
    segmentAttributes: asRecord(row.segment_attributes),
  }
}
