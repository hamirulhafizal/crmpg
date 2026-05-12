import type { SupabaseClient } from '@supabase/supabase-js'
import { utcMonthBoundsForDateKey } from '@/app/lib/automation-month-bounds'
import {
  getAccountStatusKey,
  getLastPurchaseUtcMonthDate,
  getRegistrationUtcMonthDate,
  isDirectDebitSubscriptionNo,
  isProfileVerifiedNo,
  isProfileVerifiedYes,
} from '@/app/lib/customer-account-status'

const FOLLOWUP_ACTIVITY_TOPICS = ['profile_update', 'reactivate_from_free', 'direct_debit_education'] as const
const FOLLOWUP_ACTIVITY_CHANNELS = ['whatsapp_manual', 'whatsapp_automation'] as const

const SAMPLE = 100

export type AudienceSampleRow = {
  id: string
  save_name: string | null
  name: string | null
  phone: string | null
  pg_code: string | null
}

export type AudienceBucket = {
  total: number
  sample: AudienceSampleRow[]
  error?: string
}

export type AutomationAudiencePreview = {
  date: string
  refMonth0: number
  refDay: number
  birthday: AudienceBucket
  free_followup: AudienceBucket
  active_profile_unverified: AudienceBucket
  active_verified_no_autodebit: AudienceBucket
}

function toSample(rows: { id: string; save_name: string | null; name: string | null; phone: string | null; pg_code: string | null }[]): AudienceSampleRow[] {
  return rows.slice(0, SAMPLE).map((r) => ({
    id: r.id,
    save_name: r.save_name,
    name: r.name,
    phone: r.phone,
    pg_code: r.pg_code,
  }))
}

function sentSetForKind(
  rows: { customer_id: string; kind: string }[] | null,
  kind: 'free' | 'active_profile_unverified' | 'active_verified_no_autodebit'
): Set<string> {
  const s = new Set<string>()
  for (const r of rows ?? []) {
    if (r.kind === kind) s.add(r.customer_id)
  }
  return s
}

/**
 * Preview who would match automation filters if a run happened on the given
 * calendar date (YYYY-MM-DD interpreted as Malaysia civil date for month/day logic).
 */
export async function buildAutomationAudiencePreview(
  supabase: SupabaseClient,
  userId: string,
  dateKey: string
): Promise<AutomationAudiencePreview> {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!m) {
    throw new Error('Invalid date')
  }
  const month1 = Number(m[2])
  const day = Number(m[3])
  const refMonth0 = month1 - 1

  const emptyBucket = (): AudienceBucket => ({ total: 0, sample: [] })

  const birthday: AudienceBucket = { total: 0, sample: [] }
  try {
    const { data: bRows, error: bErr } = await supabase.rpc('get_customers_by_birthday', {
      p_user_id: userId,
      p_month: month1,
      p_day: day,
    })
    if (bErr) {
      birthday.error = bErr.message
    } else {
      const list = (bRows || []) as {
        id: string
        save_name: string | null
        name: string | null
        phone: string | null
        pg_code: string | null
      }[]
      const withPhone = list.filter((r) => r.phone && String(r.phone).trim())
      birthday.total = withPhone.length
      birthday.sample = toSample(withPhone)
    }
  } catch (e) {
    birthday.error = e instanceof Error ? e.message : 'Birthday preview failed'
  }

  const { data: sentRows, error: sentErr } = await supabase
    .from('followup_campaign_sends')
    .select('customer_id, kind')
    .eq('user_id', userId)

  if (sentErr) {
    return {
      date: dateKey,
      refMonth0,
      refDay: day,
      birthday,
      free_followup: { ...emptyBucket(), error: sentErr.message },
      active_profile_unverified: { ...emptyBucket(), error: sentErr.message },
      active_verified_no_autodebit: { ...emptyBucket(), error: sentErr.message },
    }
  }

  const { data: allCustomers, error: custErr } = await supabase
    .from('customers')
    .select('id, save_name, name, phone, pg_code, original_data, created_at, last_purchase_at, is_monthly_buyer')
    .eq('user_id', userId)
    .not('phone', 'is', null)

  if (custErr || !allCustomers) {
    const err = custErr?.message || 'Failed to load customers'
    return {
      date: dateKey,
      refMonth0,
      refDay: day,
      birthday,
      free_followup: { ...emptyBucket(), error: err },
      active_profile_unverified: { ...emptyBucket(), error: err },
      active_verified_no_autodebit: { ...emptyBucket(), error: err },
    }
  }

  const customers = allCustomers as Array<{
    id: string
    save_name: string | null
    name: string | null
    phone: string | null
    pg_code: string | null
    original_data: unknown
    created_at: string | null
    last_purchase_at: string | null
    is_monthly_buyer: boolean | null
  }>

  const freeSent = sentSetForKind(sentRows as { customer_id: string; kind: string }[], 'free')
  const puSent = sentSetForKind(sentRows as { customer_id: string; kind: string }[], 'active_profile_unverified')
  const adSent = sentSetForKind(sentRows as { customer_id: string; kind: string }[], 'active_verified_no_autodebit')

  const monthRange = utcMonthBoundsForDateKey(dateKey)
  const freeActivityTouched = new Set<string>()
  const puActivityTouched = new Set<string>()
  const adActivityTouched = new Set<string>()
  if (monthRange) {
    const { data: actRows, error: actErr } = await supabase
      .from('customer_follow_up_activities')
      .select('customer_id, topic')
      .eq('user_id', userId)
      .in('channel', [...FOLLOWUP_ACTIVITY_CHANNELS])
      .gte('occurred_at', monthRange.startIso)
      .lt('occurred_at', monthRange.endExclusiveIso)
      .in('topic', [...FOLLOWUP_ACTIVITY_TOPICS])
    if (actErr) {
      console.error('[automation preview] follow-up activities load failed:', actErr.message)
    } else {
      for (const r of actRows ?? []) {
        if (r.topic === 'reactivate_from_free') freeActivityTouched.add(r.customer_id)
        else if (r.topic === 'profile_update') puActivityTouched.add(r.customer_id)
        else if (r.topic === 'direct_debit_education') adActivityTouched.add(r.customer_id)
      }
    }
  }

  const freeCandidates = customers.filter((c) => {
    if (freeSent.has(c.id) || freeActivityTouched.has(c.id)) return false
    if (getAccountStatusKey(c) !== 'free') return false
    const regParts = getRegistrationUtcMonthDate(c.original_data, c.created_at)
    if (!regParts) return false
    return regParts.month === refMonth0 && regParts.day === day
  })

  const profileUnverified = customers.filter((c) => {
    if (puSent.has(c.id) || puActivityTouched.has(c.id)) return false
    if (getAccountStatusKey(c) !== 'active') return false
    const purchaseParts = getLastPurchaseUtcMonthDate(c.original_data)
    if (!purchaseParts) return false
    if (purchaseParts.month !== refMonth0) return false
    return isProfileVerifiedNo(c.original_data)
  })

  const noAutodebit = customers.filter((c) => {
    if (adSent.has(c.id) || adActivityTouched.has(c.id)) return false
    if (getAccountStatusKey(c) !== 'active') return false
    const purchaseParts = getLastPurchaseUtcMonthDate(c.original_data)
    if (!purchaseParts) return false
    if (purchaseParts.month !== refMonth0) return false
    if (!isProfileVerifiedYes(c.original_data)) return false
    return isDirectDebitSubscriptionNo(c.original_data)
  })

  return {
    date: dateKey,
    refMonth0,
    refDay: day,
    birthday,
    free_followup: { total: freeCandidates.length, sample: toSample(freeCandidates) },
    active_profile_unverified: { total: profileUnverified.length, sample: toSample(profileUnverified) },
    active_verified_no_autodebit: { total: noAutodebit.length, sample: toSample(noAutodebit) },
  }
}
