import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { isPlatformAdmin } from '@/app/lib/saas/admin-access'
import { buildSaasMePayload, entitlementsFromMe } from '@/app/lib/saas/entitlements'
import {
  parseMaxActiveCampaigns,
  parseTruthyFlag,
} from '@/app/lib/saas/plans'
import { countConnectedChannels, loadTryPostWorkspaceForUser } from '@/app/lib/trypost/workspaces'

/**
 * v1: Social scheduling is admin-only.
 * When opening to Free/Pro users, replace requireAdminApi with entitlement checks.
 */
export async function requireSocialSchedulingApi(request?: Request) {
  return requireAdminApi(request)
}

export type TryPostEntitlements = {
  access: boolean
  maxChannels: number
  analytics: boolean
  isPlatformAdmin: boolean
  planSlug: string
}

export async function loadTryPostEntitlements(userId: string): Promise<TryPostEntitlements> {
  if (await isPlatformAdmin(userId)) {
    return {
      access: true,
      maxChannels: -1,
      analytics: true,
      isPlatformAdmin: true,
      planSlug: 'admin',
    }
  }

  const payload = await buildSaasMePayload(userId)
  if (!payload) {
    return {
      access: false,
      maxChannels: 0,
      analytics: false,
      isPlatformAdmin: false,
      planSlug: 'free',
    }
  }

  const ent = entitlementsFromMe(payload)
  const features = payload.subscription.features
  return {
    access: ent.hasPlatformWriteAccess && parseTruthyFlag(features.trypost_access ?? 'true'),
    maxChannels: parseMaxActiveCampaigns(features.trypost_max_channels ?? '1'),
    analytics: parseTruthyFlag(features.trypost_analytics ?? 'false'),
    isPlatformAdmin: false,
    planSlug: ent.planSlug,
  }
}

export async function assertTryPostChannelLimit(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string; code: 'channel_limit' }> {
  const entitlements = await loadTryPostEntitlements(userId)
  if (entitlements.maxChannels < 0) return { ok: true }

  const workspace = await loadTryPostWorkspaceForUser(userId)
  const connected = workspace ? countConnectedChannels(workspace.channels ?? []) : 0
  if (connected > entitlements.maxChannels) {
    return {
      ok: false,
      error: `Your plan allows ${entitlements.maxChannels} social channel${
        entitlements.maxChannels === 1 ? '' : 's'
      }. Upgrade to Pro for unlimited channels.`,
      code: 'channel_limit',
    }
  }
  return { ok: true }
}

export async function assertTryPostAnalyticsAccess(
  userId: string
): Promise<{ ok: true } | { ok: false; error: string; code: 'analytics_locked' }> {
  const entitlements = await loadTryPostEntitlements(userId)
  if (entitlements.analytics) return { ok: true }
  return {
    ok: false,
    error: 'Analytics is available on Pro. Upgrade to unlock channel and post insights.',
    code: 'analytics_locked',
  }
}
