import {
  hasPlatformWriteAccess,
  isProPaidActive,
  isProTrialActive,
} from '@/app/lib/saas/billing'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import type { SaasSubscriptionStatus } from '@/app/lib/saas/types'
import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'
import { clearUserWhatsAppSessions } from '@/app/lib/whatsapp/provider-switch'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export type UserWhatsAppAccess = {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  hasWriteAccess: boolean
  isProPaid: boolean
  isProTrial: boolean
  adminWasenderOverride: boolean
  isPlatformAdmin: boolean
}

export async function hasAdminWasenderServerOverride(userId: string): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('waha_server_id')
    .eq('id', userId)
    .maybeSingle()

  const assignedId = (profile?.waha_server_id || '').toString().trim()
  if (!assignedId) return false

  const { data: server } = await admin
    .from('waha_servers')
    .select('provider_type')
    .eq('id', assignedId)
    .maybeSingle()

  return server?.provider_type === 'wasender'
}

export async function loadUserWhatsAppAccess(userId: string): Promise<UserWhatsAppAccess | null> {
  if (await isPlatformAdmin(userId)) {
    return {
      planSlug: 'admin',
      status: 'active',
      trialEndsAt: null,
      currentPeriodEnd: null,
      hasWriteAccess: true,
      isProPaid: false,
      isProTrial: false,
      adminWasenderOverride: false,
      isPlatformAdmin: true,
    }
  }

  const admin = createServiceRoleClient()
  const { data: sub } = await admin.from('saas_subscriptions').select('*').eq('user_id', userId).maybeSingle()
  if (!sub) return null

  const { data: plan } = await admin.from('saas_plans').select('slug').eq('id', sub.plan_id).maybeSingle()
  const planSlug = String(plan?.slug ?? 'free')
  const status = sub.status as SaasSubscriptionStatus
  const trialEndsAt = sub.trial_ends_at as string | null
  const currentPeriodEnd = sub.current_period_end as string | null
  const now = new Date()

  const hasWriteAccess = hasPlatformWriteAccess({
    planSlug,
    status,
    trialEndsAt,
    currentPeriodEnd,
    now,
  })

  return {
    planSlug,
    status,
    trialEndsAt,
    currentPeriodEnd,
    hasWriteAccess,
    isProPaid: isProPaidActive({ planSlug, status, currentPeriodEnd, now }),
    isProTrial: isProTrialActive({ planSlug, status, trialEndsAt, now }),
    adminWasenderOverride: await hasAdminWasenderServerOverride(userId),
    isPlatformAdmin: false,
  }
}

export function effectiveWhatsAppProviders(access: UserWhatsAppAccess): WhatsAppProvider[] {
  if (access.isPlatformAdmin) return ['waha', 'wasender']
  if (!access.hasWriteAccess) return []
  if (access.isProPaid) return ['wasender']
  if (access.adminWasenderOverride) return ['waha', 'wasender']
  return ['waha']
}

export function whatsAppProviderDisplayLabel(access: UserWhatsAppAccess): string {
  if (access.isPlatformAdmin) return 'WAHA, WasenderAPI'
  if (access.isProPaid) return 'WasenderAPI'
  if (access.isProTrial) {
    return access.adminWasenderOverride ? 'WAHA (admin Wasender override)' : 'WAHA (Wasender after payment)'
  }
  if (access.adminWasenderOverride) return 'WAHA (admin Wasender override)'
  return 'WAHA'
}

export async function canUseWasenderForUser(userId: string): Promise<boolean> {
  const access = await loadUserWhatsAppAccess(userId)
  if (!access) return false
  if (access.isPlatformAdmin) return true
  return effectiveWhatsAppProviders(access).includes('wasender')
}

export async function loadPreferredWahaServerId(): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data: servers } = await admin
    .from('waha_servers')
    .select('id, provider_type, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const wahaServers = (servers ?? []).filter((s) => s.provider_type !== 'wasender')
  const preferred = wahaServers.find((s) => s.is_default) ?? wahaServers[0]
  return preferred?.id ?? null
}

export async function loadPreferredWasenderServerId(): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data: servers } = await admin
    .from('waha_servers')
    .select('id, provider_type, is_default, created_at')
    .order('is_default', { ascending: false })
    .order('created_at', { ascending: true })

  const wasenderServers = (servers ?? []).filter((s) => s.provider_type === 'wasender')
  const preferred = wasenderServers.find((s) => s.is_default) ?? wasenderServers[0]
  return preferred?.id ?? null
}

/** After Pro payment: assign Wasender server and wipe sessions for a fresh QR scan. */
export async function applyProPaidWhatsAppMigration(userId: string): Promise<void> {
  const wasenderId = await loadPreferredWasenderServerId()
  if (!wasenderId) return

  const admin = createServiceRoleClient()
  await admin.from('profiles').update({ waha_server_id: wasenderId }).eq('id', userId)
  await clearUserWhatsAppSessions(userId)
}

/** Pro trial: default to WAHA unless admin assigned Wasender; clear stale Wasender sessions. */
export async function applyProTrialWhatsAppSetup(userId: string): Promise<void> {
  const access = await loadUserWhatsAppAccess(userId)
  if (!access?.isProTrial || access.adminWasenderOverride) return

  const admin = createServiceRoleClient()
  const wahaId = await loadPreferredWahaServerId()
  if (wahaId) {
    await admin.from('profiles').update({ waha_server_id: wahaId }).eq('id', userId)
  }

  const { data: sessions } = await admin
    .from('waha_user_sessions')
    .select('provider_type, session_api_key')
    .eq('user_id', userId)

  const hasWasenderSession = (sessions ?? []).some(
    (s) => s.provider_type === 'wasender' || Boolean(String(s.session_api_key || '').trim())
  )
  if (hasWasenderSession) {
    await clearUserWhatsAppSessions(userId)
  }
}
