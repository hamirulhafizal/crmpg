import type {
  SaasFeatureKey,
  SaasPlanFeatureRow,
  SaasPlanRow,
  SaasPlanWithFeatures,
  SaasSubscriptionStatus,
} from '@/app/lib/saas/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export function featuresMapFromRows(rows: SaasPlanFeatureRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const row of rows) {
    out[row.feature_key] = row.value
  }
  return out
}

export function parseMaxActiveCampaigns(value: string | undefined): number {
  const n = Number.parseInt(value ?? '1', 10)
  if (Number.isNaN(n)) return 1
  return n
}

export function parseWhatsAppProviders(value: string | undefined): Array<'waha' | 'wasender'> {
  const raw = (value ?? 'waha')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const out = new Set<'waha' | 'wasender'>()
  for (const p of raw) {
    if (p === 'waha' || p === 'wasender') out.add(p)
  }
  if (out.size === 0) out.add('waha')
  return [...out]
}

export function isPlatformSubscriptionUsable(status: SaasSubscriptionStatus): boolean {
  return status === 'active' || status === 'trialing'
}

export async function loadSaasPlanBySlug(slug: string): Promise<SaasPlanRow | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('saas_plans').select('*').eq('slug', slug.trim()).maybeSingle()
  if (error || !data) return null
  return data as SaasPlanRow
}

export async function loadSaasPlanWithFeatures(planId: string): Promise<SaasPlanWithFeatures | null> {
  const admin = createServiceRoleClient()
  const { data: plan, error } = await admin.from('saas_plans').select('*').eq('id', planId).maybeSingle()
  if (error || !plan) return null

  const { data: features } = await admin
    .from('saas_plan_features')
    .select('*')
    .eq('plan_id', planId)
    .order('feature_key', { ascending: true })

  const { count } = await admin
    .from('saas_subscriptions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)

  return {
    ...(plan as SaasPlanRow),
    features: (features ?? []) as SaasPlanFeatureRow[],
    subscriber_count: count ?? 0,
  }
}

export async function upsertPlanFeatures(
  planId: string,
  features: Partial<Record<SaasFeatureKey, string>>
): Promise<void> {
  const admin = createServiceRoleClient()
  for (const [feature_key, value] of Object.entries(features)) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed) continue
    const { error } = await admin.from('saas_plan_features').upsert(
      { plan_id: planId, feature_key, value: trimmed },
      { onConflict: 'plan_id,feature_key' }
    )
    if (error) throw new Error(error.message)
  }
}

export async function ensureFreeSubscriptionForUser(userId: string): Promise<void> {
  const admin = createServiceRoleClient()
  const { error } = await admin.rpc('ensure_saas_free_subscription', { p_user_id: userId })
  if (error) throw new Error(error.message)
}

export async function assignSaasPlanToUser(opts: {
  userId: string
  planId: string
  adminUserId: string
  status?: SaasSubscriptionStatus
  lockedPriceAmount?: number
  trialDaysOverride?: number | null
  periodDays?: number
}): Promise<void> {
  const admin = createServiceRoleClient()
  const { data: plan, error: planErr } = await admin.from('saas_plans').select('*').eq('id', opts.planId).maybeSingle()
  if (planErr || !plan) throw new Error('Plan not found')

  const planRow = plan as SaasPlanRow
  const now = new Date()
  const trialDays =
    opts.trialDaysOverride === null
      ? 0
      : typeof opts.trialDaysOverride === 'number'
        ? Math.max(0, opts.trialDaysOverride)
        : planRow.trial_days

  let status: SaasSubscriptionStatus = opts.status ?? 'active'
  let trialEndsAt: string | null = null
  let periodStart: string | null = now.toISOString()
  let periodEnd: string | null = null

  const lockedPrice =
    typeof opts.lockedPriceAmount === 'number' && Number.isFinite(opts.lockedPriceAmount)
      ? opts.lockedPriceAmount
      : Number(planRow.price_amount)

  if (planRow.slug !== 'free' && trialDays > 0 && status !== 'expired') {
    status = 'trialing'
    const trialEnd = new Date(now.getTime() + trialDays * 24 * 60 * 60 * 1000)
    trialEndsAt = trialEnd.toISOString()
    periodEnd = trialEndsAt
  } else if (planRow.slug === 'free') {
    status = 'active'
    periodStart = now.toISOString()
    periodEnd = null
  } else if (planRow.billing_period === 'monthly') {
    const days = opts.periodDays ?? 30
    periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString()
    status = opts.status ?? 'active'
  }

  const payload = {
    user_id: opts.userId,
    plan_id: opts.planId,
    status,
    locked_price_amount: planRow.slug === 'free' ? 0 : lockedPrice,
    locked_currency: planRow.currency || 'MYR',
    trial_ends_at: trialEndsAt,
    current_period_start: periodStart,
    current_period_end: periodEnd,
    admin_assigned_by: opts.adminUserId,
    admin_assigned_at: now.toISOString(),
    updated_at: now.toISOString(),
  }

  const { error } = await admin.from('saas_subscriptions').upsert(payload, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}
