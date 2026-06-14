import { isProSubscriptionActive } from '@/app/lib/saas/billing'
import {
  ADMIN_UNLIMITED_FEATURES,
  ADMIN_WHATSAPP_PROVIDERS,
  hasWasenderGrandfatherAccess,
  isPlatformAdmin,
} from '@/app/lib/saas/admin-access'
import { buildSaasMePayload, entitlementsFromMe } from '@/app/lib/saas/entitlements'
import {
  featuresMapFromRows,
  parseMaxActiveCampaigns,
  parseWhatsAppProviders,
} from '@/app/lib/saas/plans'
import type { SaasSubscriptionStatus } from '@/app/lib/saas/types'
import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type UserEntitlements = {
  maxActiveCampaigns: number
  whatsappProviders: WhatsAppProvider[]
  isProActive: boolean
  planSlug: string
  status: string
  activeCampaigns: number
  atCampaignLimit: boolean
  isPlatformAdmin: boolean
}

async function loadEffectiveWhatsAppProviders(userId: string): Promise<WhatsAppProvider[]> {
  if (await isPlatformAdmin(userId)) return ADMIN_WHATSAPP_PROVIDERS

  const admin = createServiceRoleClient()
  const { data: sub } = await admin.from('saas_subscriptions').select('*').eq('user_id', userId).maybeSingle()
  if (!sub) return ['waha']

  const { data: plan } = await admin.from('saas_plans').select('slug').eq('id', sub.plan_id).maybeSingle()
  const planSlug = String(plan?.slug ?? 'free')

  const { data: subFeatures } = await admin.from('saas_plan_features').select('*').eq('plan_id', sub.plan_id)
  const planFeatures = featuresMapFromRows(subFeatures ?? [])

  const proActive = isProSubscriptionActive({
    planSlug,
    status: sub.status as SaasSubscriptionStatus,
    trialEndsAt: sub.trial_ends_at,
    currentPeriodEnd: sub.current_period_end,
  })

  if (proActive) {
    return parseWhatsAppProviders(planFeatures.whatsapp_providers)
  }

  const { data: freePlan } = await admin.from('saas_plans').select('id').eq('slug', 'free').maybeSingle()
  if (!freePlan?.id) return ['waha']

  const { data: freeFeatures } = await admin.from('saas_plan_features').select('*').eq('plan_id', freePlan.id)
  return parseWhatsAppProviders(featuresMapFromRows(freeFeatures ?? []).whatsapp_providers)
}

export async function loadUserEntitlements(userId: string): Promise<UserEntitlements | null> {
  const platformAdmin = await isPlatformAdmin(userId)
  const activeCampaigns = await countActiveCampaigns(userId)

  if (platformAdmin) {
    return {
      maxActiveCampaigns: -1,
      whatsappProviders: ADMIN_WHATSAPP_PROVIDERS,
      isProActive: true,
      planSlug: 'admin',
      status: 'active',
      activeCampaigns,
      atCampaignLimit: false,
      isPlatformAdmin: true,
    }
  }

  const payload = await buildSaasMePayload(userId)
  if (!payload) return null
  const ent = entitlementsFromMe(payload)

  return {
    maxActiveCampaigns: ent.maxActiveCampaigns,
    whatsappProviders: ent.whatsappProviders,
    isProActive: ent.isProActive,
    planSlug: ent.planSlug,
    status: ent.status,
    activeCampaigns,
    atCampaignLimit: ent.atCampaignLimit,
    isPlatformAdmin: false,
  }
}

export async function countActiveCampaigns(
  userId: string,
  excludeCampaignId?: string
): Promise<number> {
  const admin = createServiceRoleClient()
  let query = admin
    .from('campaigns')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'active')

  if (excludeCampaignId) {
    query = query.neq('id', excludeCampaignId)
  }

  const { count } = await query
  return count ?? 0
}

export async function canActivateCampaign(
  userId: string,
  excludeCampaignId?: string
): Promise<{ ok: true } | { ok: false; error: string; code: 'campaign_limit' }> {
  if (await isPlatformAdmin(userId)) return { ok: true }

  const entitlements = await loadUserEntitlements(userId)
  if (!entitlements) {
    return { ok: false, error: 'Subscription not found', code: 'campaign_limit' }
  }

  const max = entitlements.maxActiveCampaigns
  if (max < 0) return { ok: true }

  const activeCount = await countActiveCampaigns(userId, excludeCampaignId)
  if (activeCount >= max) {
    return {
      ok: false,
      error:
        max === 1
          ? 'Free plan allows 1 active campaign. Pause another campaign or upgrade to Pro.'
          : `Your plan allows ${max} active campaigns. Pause another campaign or upgrade to Pro.`,
      code: 'campaign_limit',
    }
  }

  return { ok: true }
}

export function isWhatsAppProviderAllowed(
  providers: WhatsAppProvider[],
  provider: WhatsAppProvider
): boolean {
  return providers.includes(provider)
}

/** Platform admin, Pro plan, admin-assigned Wasender, or existing Wasender session. */
export async function canUseWasenderForUser(userId: string): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true

  const providers = await loadEffectiveWhatsAppProviders(userId)
  if (providers.includes('wasender')) return true

  return hasWasenderGrandfatherAccess(userId)
}

/** IDs of active campaigns allowed to run under the user's plan (oldest first). */
export async function allowedActiveCampaignIds(
  userId: string,
  maxActive: number
): Promise<Set<string>> {
  if (await isPlatformAdmin(userId)) return new Set(['*'])
  if (maxActive < 0) return new Set(['*'])

  const admin = createServiceRoleClient()
  const { data } = await admin
    .from('campaigns')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: true })
    .limit(Math.max(maxActive, 0))

  return new Set((data ?? []).map((r) => r.id as string))
}

export async function pauseExcessActiveCampaigns(
  userId: string,
  maxActive: number
): Promise<number> {
  if (await isPlatformAdmin(userId)) return 0
  if (maxActive < 0) return 0

  const admin = createServiceRoleClient()
  const { data: active } = await admin
    .from('campaigns')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('updated_at', { ascending: true })

  const rows = active ?? []
  if (rows.length <= maxActive) return 0

  const toPause = rows.slice(maxActive).map((r) => r.id as string)
  if (toPause.length === 0) return 0

  const { error } = await admin
    .from('campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .in('id', toPause)

  if (error) throw new Error(error.message)
  return toPause.length
}

export function maxActiveFromFeatures(features: Record<string, string>): number {
  return parseMaxActiveCampaigns(features.max_active_campaigns)
}

export { ADMIN_UNLIMITED_FEATURES, isPlatformAdmin, hasWasenderGrandfatherAccess }
