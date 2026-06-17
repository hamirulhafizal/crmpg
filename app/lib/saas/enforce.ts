import { hasPlatformWriteAccess, isProSubscriptionActive } from '@/app/lib/saas/billing'
import {
  ADMIN_UNLIMITED_FEATURES,
  ADMIN_WHATSAPP_PROVIDERS,
  isPlatformAdmin,
} from '@/app/lib/saas/admin-access'
import { buildSaasMePayload, entitlementsFromMe } from '@/app/lib/saas/entitlements'
import {
  effectiveWhatsAppProviders,
  loadUserWhatsAppAccess,
} from '@/app/lib/saas/whatsapp-access'
import {
  parseMaxActiveCampaigns,
} from '@/app/lib/saas/plans'
import { loadCampaignPlatformDefaultTier } from '@/app/lib/campaigns/platform-defaults'
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
  hasPlatformWriteAccess: boolean
}

async function loadSubscriptionForUser(userId: string) {
  const admin = createServiceRoleClient()
  const { data: sub } = await admin.from('saas_subscriptions').select('*').eq('user_id', userId).maybeSingle()
  if (!sub) return null
  const { data: plan } = await admin.from('saas_plans').select('slug').eq('id', sub.plan_id).maybeSingle()
  return {
    sub,
    planSlug: String(plan?.slug ?? 'free'),
    status: sub.status as SaasSubscriptionStatus,
    trialEndsAt: sub.trial_ends_at as string | null,
    currentPeriodEnd: sub.current_period_end as string | null,
  }
}

export async function userHasPlatformWriteAccess(userId: string): Promise<boolean> {
  if (await isPlatformAdmin(userId)) return true
  const row = await loadSubscriptionForUser(userId)
  if (!row) return false
  return hasPlatformWriteAccess({
    planSlug: row.planSlug,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    currentPeriodEnd: row.currentPeriodEnd,
  })
}

export async function assertPlatformWriteAccess(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string; code: 'platform_locked' }> {
  if (await userHasPlatformWriteAccess(userId)) return { ok: true }
  return {
    ok: false,
    error:
      'Your free trial has ended. Upgrade to Pro to use WhatsApp and campaigns. You can still view customers.',
    code: 'platform_locked',
  }
}

async function loadEffectiveWhatsAppProviders(userId: string): Promise<WhatsAppProvider[]> {
  const access = await loadUserWhatsAppAccess(userId)
  if (!access) return ['waha']
  return effectiveWhatsAppProviders(access)
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
      hasPlatformWriteAccess: true,
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
    hasPlatformWriteAccess: ent.hasPlatformWriteAccess,
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
): Promise<
  | { ok: true }
  | { ok: false; error: string; code: 'campaign_limit' | 'platform_locked' | 'pro_required' }
> {
  if (await isPlatformAdmin(userId)) return { ok: true }

  const writeGate = await assertPlatformWriteAccess(userId)
  if (!writeGate.ok) return writeGate

  if (excludeCampaignId) {
    const admin = createServiceRoleClient()
    const { data: campaign } = await admin
      .from('campaigns')
      .select('platform_default_id')
      .eq('id', excludeCampaignId)
      .eq('user_id', userId)
      .maybeSingle()

    if (campaign?.platform_default_id) {
      const tier = await loadCampaignPlatformDefaultTier(admin, campaign.platform_default_id)
      if (tier === 'pro') {
        const row = await loadSubscriptionForUser(userId)
        if (!row) {
          return { ok: false, error: 'Subscription not found', code: 'pro_required' }
        }
        const proActive = isProSubscriptionActive({
          planSlug: row.planSlug,
          status: row.status,
          trialEndsAt: row.trialEndsAt,
          currentPeriodEnd: row.currentPeriodEnd,
        })
        if (!proActive) {
          return {
            ok: false,
            error: 'Pro workflows are read-only without an active Pro subscription. Upgrade to activate.',
            code: 'pro_required',
          }
        }
      }
    }
  }

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
          ? 'Free plan allows 1 active workflow. Pause another workflow or upgrade to Pro.'
          : `Your plan allows ${max} active workflows. Pause another workflow or upgrade to Pro.`,
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

/** Platform admin, Pro paid, or admin-assigned Wasender server override. */
export async function canUseWasenderForUser(userId: string): Promise<boolean> {
  const providers = await loadEffectiveWhatsAppProviders(userId)
  return providers.includes('wasender')
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

export async function pauseAllActiveCampaigns(userId: string): Promise<number> {
  return pauseExcessActiveCampaigns(userId, 0)
}

export function maxActiveFromFeatures(features: Record<string, string>): number {
  return parseMaxActiveCampaigns(features.max_active_campaigns)
}

export { ADMIN_UNLIMITED_FEATURES, isPlatformAdmin }
export { hasAdminWasenderServerOverride as hasWasenderGrandfatherAccess } from '@/app/lib/saas/whatsapp-access'
