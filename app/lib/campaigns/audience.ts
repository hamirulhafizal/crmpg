import { getAccountStatusKey } from '@/app/lib/customer-account-status'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'

type TagEmbed = { slug?: string } | { slug?: string }[] | null

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
  /** PostgREST may return `tags` as an object or a one-element array depending on embed shape. */
  customer_tags?: Array<{ tag_id?: string; tags?: TagEmbed } | null> | null
}

function lastPurchaseDaysAgo(row: CustomerForAudience): number | null {
  if (!row.last_purchase_at) return null
  const ms = new Date(row.last_purchase_at).getTime()
  if (!Number.isFinite(ms)) return null
  return (Date.now() - ms) / (24 * 60 * 60 * 1000)
}

function slugFromTagEmbed(tags: TagEmbed | undefined): string | null {
  if (tags == null) return null
  if (Array.isArray(tags)) {
    const row = tags[0]
    const slug = row && typeof row === 'object' && 'slug' in row ? (row as { slug?: string }).slug : undefined
    return slug ? String(slug).toLowerCase() : null
  }
  if (typeof tags === 'object' && 'slug' in tags && tags.slug) {
    return String(tags.slug).toLowerCase()
  }
  return null
}

export function customerTagSlugs(c: CustomerForAudience): Set<string> {
  const s = new Set<string>()
  for (const ct of c.customer_tags ?? []) {
    const slug = slugFromTagEmbed(ct?.tags)
    if (slug) s.add(slug)
  }
  return s
}

export function customerTagIds(c: CustomerForAudience): Set<string> {
  const s = new Set<string>()
  for (const ct of c.customer_tags ?? []) {
    const id = ct?.tag_id
    if (id) s.add(String(id))
  }
  return s
}

export function customerMatchesFilters(c: CustomerForAudience, filters: CampaignAudienceFilters): boolean {
  if (!c.phone || !String(c.phone).trim()) return false

  const wantSlugs = (filters.tag_slugs ?? []).map((t) => String(t).toLowerCase().trim()).filter(Boolean)
  const wantIds = (filters.tag_ids ?? []).map((id) => String(id).trim()).filter(Boolean)
  if (wantSlugs.length > 0 || wantIds.length > 0) {
    const haveSlugs = customerTagSlugs(c)
    const haveIds = customerTagIds(c)
    const slugOk = wantSlugs.length === 0 || wantSlugs.some((t) => haveSlugs.has(t))
    const idOk = wantIds.length === 0 || wantIds.some((tid) => haveIds.has(tid))
    if (wantSlugs.length > 0 && wantIds.length > 0) {
      if (!slugOk && !idOk) return false
    } else if (wantSlugs.length > 0) {
      if (!slugOk) return false
    } else if (!idOk) return false
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

  if (filters.last_purchase_days_gt != null && filters.last_purchase_days_gt > 0) {
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
