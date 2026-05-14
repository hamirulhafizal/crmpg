import { getAccountStatusKey } from '@/app/lib/customer-account-status'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'

export type CustomerForAudience = {
  id: string
  phone: string | null
  name: string | null
  first_name: string | null
  pg_code: string | null
  save_name: string | null
  gender: string | null
  location: string | null
  last_purchase_at: string | null
  is_monthly_buyer: boolean | null
  is_friend: boolean | null
  original_data: unknown
  segment_attributes: Record<string, unknown> | null
  customer_tags?: Array<{ tags: { slug: string } | null }> | null
}

function lastPurchaseDaysAgo(row: CustomerForAudience): number | null {
  if (!row.last_purchase_at) return null
  const ms = new Date(row.last_purchase_at).getTime()
  if (!Number.isFinite(ms)) return null
  return (Date.now() - ms) / (24 * 60 * 60 * 1000)
}

export function customerTagSlugs(c: CustomerForAudience): Set<string> {
  const s = new Set<string>()
  for (const ct of c.customer_tags ?? []) {
    const slug = ct?.tags?.slug
    if (slug) s.add(slug.toLowerCase())
  }
  return s
}

export function customerMatchesFilters(c: CustomerForAudience, filters: CampaignAudienceFilters): boolean {
  if (!c.phone || !String(c.phone).trim()) return false

  const wantTags = (filters.tag_slugs ?? []).map((t) => t.toLowerCase())
  if (wantTags.length > 0) {
    const have = customerTagSlugs(c)
    if (!wantTags.some((t) => have.has(t))) return false
  }

  if (filters.tag_ids?.length) {
    // When only tag_ids in JSON without slugs, require client to pass expanded slugs; skip id match here.
  }

  const st = filters.account_status
  if (st?.length) {
    const key = getAccountStatusKey(c)
    if (!st.includes(key as (typeof st)[number])) return false
  }

  if (filters.is_monthly_buyer != null) {
    if (Boolean(c.is_monthly_buyer) !== filters.is_monthly_buyer) return false
  }
  if (filters.is_friend != null) {
    if (Boolean(c.is_friend) !== filters.is_friend) return false
  }
  if (filters.gender) {
    if ((c.gender || '').toLowerCase() !== filters.gender.toLowerCase()) return false
  }
  if (filters.location_contains?.trim()) {
    if (!(c.location || '').toLowerCase().includes(filters.location_contains.trim().toLowerCase())) return false
  }

  if (filters.last_purchase_days_gt != null) {
    const days = lastPurchaseDaysAgo(c)
    if (days == null) return false
    if (days <= filters.last_purchase_days_gt) return false
  }

  if (filters.segment_attributes && typeof filters.segment_attributes === 'object') {
    const seg = c.segment_attributes || {}
    for (const [k, v] of Object.entries(filters.segment_attributes)) {
      if (v == null) continue
      if (seg[k] !== v) return false
    }
  }

  return true
}
