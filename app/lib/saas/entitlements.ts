import {
  isBayarcashConfiguredForCheckout,
  isGoogleAdsBayarcashRenewalEnabled,
} from '@/app/lib/bayarcash/config'
import {
  canCheckoutPro,
  hasPlatformWriteAccess,
  isFreeTrialActive,
  isProSubscriptionActive,
  isTrialUpgradeCheckout,
} from '@/app/lib/saas/billing'
import {
  featuresMapFromRows,
  parseMaxActiveCampaigns,
  parseWhatsAppProviders,
} from '@/app/lib/saas/plans'
import type {
  SaasPlanFeatureRow,
  SaasPlanRow,
  SaasSubscriptionRow,
} from '@/app/lib/saas/types'
import {
  ADMIN_UNLIMITED_FEATURES,
  ADMIN_WHATSAPP_PROVIDERS,
  hasWasenderGrandfatherAccess,
  isPlatformAdmin,
} from '@/app/lib/saas/admin-access'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type SaasMePayload = {
  subscription: SaasSubscriptionRow & { plan: SaasPlanRow; features: Record<string, string> }
  plans: Array<SaasPlanRow & { features: Record<string, string>; bullets: string[] }>
  usage: { active_campaigns: number }
  payments: Array<{
    id: string
    order_number: string
    amount: number
    currency: string
    status: string
    receipt_label: string | null
    created_at: string
  }>
  flags: {
    is_pro_active: boolean
    is_free_trial_active: boolean
    has_platform_write_access: boolean
    can_start_trial: boolean
    can_checkout: boolean
    bayarcash_checkout_enabled: boolean
    trial_days: number
    free_trial_days: number
    renewal_price: number
    list_price: number
    is_platform_admin: boolean
    can_upgrade_from_trial: boolean
  }
  alerts: {
    at_campaign_limit: boolean
    days_until_expiry: number | null
    subscription_expiring_soon: boolean
    trial_ending_soon: boolean
    free_trial_ending_soon: boolean
    plan_expired: boolean
    platform_read_only: boolean
    wasender_available: boolean
  }
}

function bulletsFromPlan(plan: SaasPlanRow): string[] {
  const raw = plan.marketing_details?.bullets
  return Array.isArray(raw) ? raw.map(String).filter(Boolean) : []
}

const MS_DAY = 24 * 60 * 60 * 1000

function daysUntil(iso: string | null, now: Date): number | null {
  if (!iso) return null
  return Math.ceil((new Date(iso).getTime() - now.getTime()) / MS_DAY)
}

/** When Pro is inactive, apply Free plan limits even if plan_id still points at Pro. */
export function effectiveSubscriptionFeatures(
  payload: SaasMePayload
): Record<string, string> {
  if (payload.flags.is_pro_active) return payload.subscription.features
  const freePlan = payload.plans.find((p) => p.slug === 'free')
  return freePlan?.features ?? payload.subscription.features
}

export async function buildSaasMePayload(userId: string): Promise<SaasMePayload | null> {
  const admin = createServiceRoleClient()

  const { data: sub, error: subErr } = await admin
    .from('saas_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (subErr || !sub) {
    await admin.rpc('ensure_saas_free_subscription', { p_user_id: userId })
    const { data: retry } = await admin.from('saas_subscriptions').select('*').eq('user_id', userId).maybeSingle()
    if (!retry) return null
    return buildSaasMePayload(userId)
  }

  const subscription = sub as SaasSubscriptionRow

  const { data: plan } = await admin.from('saas_plans').select('*').eq('id', subscription.plan_id).maybeSingle()
  if (!plan) return null

  const { data: subFeatures } = await admin
    .from('saas_plan_features')
    .select('*')
    .eq('plan_id', subscription.plan_id)

  const { data: allPlans } = await admin
    .from('saas_plans')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const planIds = (allPlans ?? []).map((p) => p.id)
  const { data: allFeatures } = planIds.length
    ? await admin.from('saas_plan_features').select('*').in('plan_id', planIds)
    : { data: [] }

  const featuresByPlan = new Map<string, SaasPlanFeatureRow[]>()
  for (const f of allFeatures ?? []) {
    const row = f as SaasPlanFeatureRow
    const list = featuresByPlan.get(row.plan_id) ?? []
    list.push(row)
    featuresByPlan.set(row.plan_id, list)
  }

  const { count: activeCampaigns } = await admin
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')

  const { data: payments } = await admin
    .from('saas_payments')
    .select('id, order_number, amount, currency, status, receipt_label, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(12)

  const planRow = plan as SaasPlanRow
  const freePlanRow = (allPlans ?? []).find((p) => p.slug === 'free') as SaasPlanRow | undefined
  const proPlan = (allPlans ?? []).find((p) => p.slug === 'pro') as SaasPlanRow | undefined
  const meta = (subscription.payment_metadata ?? {}) as Record<string, unknown>
  const trialUsed = meta.trial_used === true
  const platformAdmin = await isPlatformAdmin(userId)
  const now = new Date()

  let isProActive = isProSubscriptionActive({
    planSlug: planRow.slug,
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    currentPeriodEnd: subscription.current_period_end,
    now,
  })

  const isFreeTrialActiveNow = isFreeTrialActive({
    planSlug: planRow.slug,
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    now,
  })

  const hasWriteAccess =
    platformAdmin ||
    hasPlatformWriteAccess({
      planSlug: planRow.slug,
      status: subscription.status,
      trialEndsAt: subscription.trial_ends_at,
      currentPeriodEnd: subscription.current_period_end,
      now,
    })

  if (platformAdmin) {
    isProActive = true
  }

  const canCheckout = canCheckoutPro({
    planSlug: planRow.slug,
    status: subscription.status,
    trialEndsAt: subscription.trial_ends_at,
    currentPeriodEnd: subscription.current_period_end,
  })
  const upgradingFromTrial = isTrialUpgradeCheckout({
    planSlug: planRow.slug,
    status: subscription.status,
  })

  const canStartTrial =
    !trialUsed &&
    !isProActive &&
    (planRow.slug === 'free' || subscription.status === 'expired' || subscription.status === 'cancelled') &&
    (proPlan?.trial_days ?? 0) > 0

  const subFeatureMap = featuresMapFromRows((subFeatures ?? []) as SaasPlanFeatureRow[])

  const plansWithFeatures = (allPlans ?? []).map((p) => {
    const pr = p as SaasPlanRow
    return {
      ...pr,
      features: featuresMapFromRows(featuresByPlan.get(pr.id) ?? []),
      bullets: bulletsFromPlan(pr),
    }
  })

  const freePlanFeatures =
    plansWithFeatures.find((p) => p.slug === 'free')?.features ?? subFeatureMap
  let effectiveFeatures = isProActive ? subFeatureMap : freePlanFeatures

  if (platformAdmin) {
    effectiveFeatures = { ...freePlanFeatures, ...ADMIN_UNLIMITED_FEATURES }
  } else if (!hasWriteAccess) {
    effectiveFeatures = {
      ...freePlanFeatures,
      max_active_campaigns: '0',
      whatsapp_providers: '',
      platform_access: 'read_only',
    }
  }

  const maxCampaigns = platformAdmin
    ? -1
    : !hasWriteAccess
      ? 0
      : parseMaxActiveCampaigns(effectiveFeatures.max_active_campaigns)
  const whatsappProviders = platformAdmin
    ? ADMIN_WHATSAPP_PROVIDERS
    : !hasWriteAccess
      ? []
      : parseWhatsAppProviders(effectiveFeatures.whatsapp_providers)
  let wasenderAvailable =
    platformAdmin ||
    (hasWriteAccess &&
      (whatsappProviders.includes('wasender') || (await hasWasenderGrandfatherAccess(userId))))
  const activeCount = activeCampaigns ?? 0

  const expiryIso =
    subscription.status === 'trialing'
      ? subscription.trial_ends_at
      : subscription.status === 'active' && planRow.slug === 'pro'
        ? subscription.current_period_end
        : null
  const daysLeft = daysUntil(expiryIso, now)
  const planExpired =
    !platformAdmin &&
    (subscription.status === 'expired' ||
      (planRow.slug === 'free' && !isFreeTrialActiveNow && subscription.status !== 'cancelled'))

  return {
    subscription: {
      ...subscription,
      plan: planRow,
      features: effectiveFeatures,
    },
    plans: plansWithFeatures,
    usage: { active_campaigns: activeCount },
    payments: (payments ?? []) as SaasMePayload['payments'],
    flags: {
      is_pro_active: isProActive,
      is_free_trial_active: platformAdmin ? false : isFreeTrialActiveNow,
      has_platform_write_access: hasWriteAccess,
      can_start_trial: platformAdmin ? false : canStartTrial,
      can_checkout: platformAdmin ? false : canCheckout && (proPlan?.price_amount ?? 0) > 0,
      bayarcash_checkout_enabled:
        isGoogleAdsBayarcashRenewalEnabled() && isBayarcashConfiguredForCheckout(),
      trial_days: proPlan?.trial_days ?? 0,
      free_trial_days: freePlanRow?.trial_days ?? 0,
      renewal_price: Number(subscription.locked_price_amount) || Number(proPlan?.price_amount ?? 0),
      list_price: Number(proPlan?.price_amount ?? 0),
      is_platform_admin: platformAdmin,
      can_upgrade_from_trial: platformAdmin ? false : upgradingFromTrial,
    },
    alerts: {
      at_campaign_limit: platformAdmin ? false : hasWriteAccess && maxCampaigns >= 0 && activeCount >= maxCampaigns,
      days_until_expiry: platformAdmin ? null : hasWriteAccess ? daysLeft : null,
      subscription_expiring_soon:
        platformAdmin ? false : isProActive && subscription.status === 'active' && daysLeft != null && daysLeft <= 7,
      trial_ending_soon:
        platformAdmin ? false : isProActive && subscription.status === 'trialing' && daysLeft != null && daysLeft <= 3,
      free_trial_ending_soon:
        platformAdmin ? false : isFreeTrialActiveNow && daysLeft != null && daysLeft <= 1,
      plan_expired: planExpired,
      platform_read_only: platformAdmin ? false : !hasWriteAccess,
      wasender_available: wasenderAvailable,
    },
  }
}

export function entitlementsFromMe(payload: SaasMePayload) {
  const platformAdmin = payload.flags.is_platform_admin
  const maxCampaigns = platformAdmin
    ? -1
    : parseMaxActiveCampaigns(payload.subscription.features.max_active_campaigns)
  const whatsappProviders = platformAdmin
    ? ADMIN_WHATSAPP_PROVIDERS
    : parseWhatsAppProviders(payload.subscription.features.whatsapp_providers)

  return {
    maxActiveCampaigns: maxCampaigns,
    whatsappProviders,
    platformAccess: platformAdmin || payload.flags.has_platform_write_access,
    hasPlatformWriteAccess: platformAdmin || payload.flags.has_platform_write_access,
    isProActive: platformAdmin || payload.flags.is_pro_active,
    isFreeTrialActive: platformAdmin ? false : payload.flags.is_free_trial_active,
    planSlug: platformAdmin ? 'admin' : payload.flags.is_pro_active ? payload.subscription.plan.slug : 'free',
    status: payload.subscription.status,
    atCampaignLimit: platformAdmin ? false : payload.alerts.at_campaign_limit,
    isPlatformAdmin: platformAdmin,
  }
}
