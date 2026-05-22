import {
  getAccountStatusKey,
  getLastPurchaseUtcYmd,
  getRegistrationUtcYmd,
} from '@/app/lib/customer-account-status'
import { customerDobIsToday, customerDobMatchesMonthDayFilter, getMalaysiaTodayYmd } from '@/app/lib/customer-dob'
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
  ethnicity: string | null
  location: string | null
  last_purchase_at: string | null
  dob?: string | null
  created_at?: string | null
  is_monthly_buyer: boolean | null
  is_friend: boolean | null
  original_data: unknown
  segment_attributes: Record<string, unknown> | null
  /** PostgREST may return `tags` as an object or a one-element array depending on embed shape. */
  customer_tags?: Array<{ tag_id?: string; tags?: TagEmbed } | null> | null
}

function ymdInRange(ymd: string | null, from?: string | null, to?: string | null): boolean {
  const f = from?.trim()
  const t = to?.trim()
  if (!f && !t) return true
  if (!ymd) return false
  if (f && ymd < f) return false
  if (t && ymd > t) return false
  return true
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

  const wantEthnicities = (filters.ethnicities ?? []).map((e) => String(e).trim()).filter(Boolean)
  if (wantEthnicities.length > 0) {
    const have = (c.ethnicity || '').trim()
    if (!have) return false
    const haveLower = have.toLowerCase()
    if (!wantEthnicities.some((e) => e.toLowerCase() === haveLower)) return false
  }

  if (filters.location_contains?.trim()) {
    if (!(c.location || '').toLowerCase().includes(filters.location_contains.trim().toLowerCase())) return false
  }

  if (filters.last_purchase_days_gt != null && filters.last_purchase_days_gt > 0) {
    const days = lastPurchaseDaysAgo(c)
    if (days == null) return false
    if (days <= filters.last_purchase_days_gt) return false
  }

  if (filters.dob_is_today) {
    if (!customerDobIsToday(c.dob)) return false
  } else if (filters.dob_month != null && filters.dob_month >= 1 && filters.dob_month <= 12) {
    if (
      !customerDobMatchesMonthDayFilter(
        c.dob,
        filters.dob_month,
        filters.dob_day_from,
        filters.dob_day_to
      )
    ) {
      return false
    }
  }

  if (filters.last_purchase_is_today) {
    const ymd = getLastPurchaseUtcYmd(c)
    if (ymd !== getMalaysiaTodayYmd()) return false
  } else {
    const lpFrom = filters.last_purchase_on_or_after?.trim()
    const lpTo = filters.last_purchase_on_or_before?.trim()
    if (lpFrom || lpTo) {
      const ymd = getLastPurchaseUtcYmd(c)
      if (!ymdInRange(ymd, lpFrom, lpTo)) return false
    }
  }

  if (filters.register_is_today) {
    const ymd = getRegistrationUtcYmd(c.original_data, c.created_at)
    if (ymd !== getMalaysiaTodayYmd()) return false
  } else {
    const regFrom = filters.register_on_or_after?.trim()
    const regTo = filters.register_on_or_before?.trim()
    if (regFrom || regTo) {
      const ymd = getRegistrationUtcYmd(c.original_data, c.created_at)
      if (!ymdInRange(ymd, regFrom, regTo)) return false
    }
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

/** True when any audience rule is configured (empty object = no rules). */
export function audienceFiltersConfigured(filters: CampaignAudienceFilters): boolean {
  const f = filters ?? {}
  if ((f.tag_slugs ?? []).some((t) => String(t).trim())) return true
  if ((f.tag_ids ?? []).some((id) => String(id).trim())) return true
  if ((f.account_status ?? []).length > 0) return true
  if (f.is_monthly_buyer != null) return true
  if (f.is_friend != null) return true
  if (f.gender?.trim()) return true
  if ((f.ethnicities ?? []).length > 0) return true
  if (f.location_contains?.trim()) return true
  if (f.last_purchase_days_gt != null && f.last_purchase_days_gt > 0) return true
  if (f.dob_is_today) return true
  if (f.dob_month != null && f.dob_month >= 1 && f.dob_month <= 12) return true
  if (f.last_purchase_is_today) return true
  if (f.register_is_today) return true
  if (f.last_purchase_on_or_after?.trim() || f.last_purchase_on_or_before?.trim()) return true
  if (f.register_on_or_after?.trim() || f.register_on_or_before?.trim()) return true
  if (f.segment_attributes && Object.keys(f.segment_attributes).length > 0) return true
  return false
}

/** PostgREST embed for audience matching (tags + fields used by {@link customerMatchesFilters}). */
export const CUSTOMER_EMBED_FOR_AUDIENCE_MATCH = `
  id, phone, name, first_name, pg_code, save_name, gender, ethnicity, location, last_purchase_at, dob, created_at, original_data, is_monthly_buyer, is_friend, segment_attributes,
  customer_tags ( tag_id, tags ( slug ) )
`
