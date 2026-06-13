import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { getServerProviderById } from '@/app/lib/whatsapp/resolve'
import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'

/** Remove all stored sessions for a user (after provider switch). */
export async function clearUserWhatsAppSessions(userId: string): Promise<number> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin.from('waha_user_sessions').delete().eq('user_id', userId).select('id')
  if (error) throw error
  return data?.length ?? 0
}

/** Clear sessions for all users assigned to a server (when server provider changes). */
export async function clearSessionsForServerUsers(serverId: string): Promise<number> {
  const admin = createServiceRoleClient()
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id')
    .eq('waha_server_id', serverId)
  if (pErr) throw pErr
  const userIds = (profiles || []).map((p) => p.id)
  if (userIds.length === 0) return 0

  const { data, error } = await admin.from('waha_user_sessions').delete().in('user_id', userIds).select('id')
  if (error) throw error
  return data?.length ?? 0
}

/**
 * When admin assigns a different server (possibly different provider), wipe sessions
 * so dealer must scan QR again.
 */
export async function handleUserServerAssignmentChange(
  userId: string,
  previousServerId: string | null,
  nextServerId: string | null
): Promise<{ cleared: boolean; reason?: string }> {
  if (previousServerId === nextServerId) return { cleared: false }

  const [prevProvider, nextProvider] = await Promise.all([
    getServerProviderById(previousServerId),
    getServerProviderById(nextServerId),
  ])

  const providerChanged =
    (prevProvider && nextProvider && prevProvider !== nextProvider) ||
    (prevProvider && !nextProvider) ||
    (!prevProvider && nextProvider) ||
    previousServerId !== nextServerId

  if (!providerChanged && previousServerId === nextServerId) {
    return { cleared: false }
  }

  // Any server assignment change clears sessions (different host or provider).
  if (previousServerId !== nextServerId) {
    await clearUserWhatsAppSessions(userId)
    return {
      cleared: true,
      reason:
        prevProvider !== nextProvider
          ? `Provider changed (${prevProvider ?? 'default'} → ${nextProvider ?? 'default'}). Dealer must reconnect WhatsApp.`
          : 'WhatsApp server assignment changed. Dealer must reconnect WhatsApp.',
    }
  }

  return { cleared: false }
}

export async function handleServerProviderTypeChange(
  serverId: string,
  previousProvider: WhatsAppProvider,
  nextProvider: WhatsAppProvider
): Promise<number> {
  if (previousProvider === nextProvider) return 0
  return clearSessionsForServerUsers(serverId)
}
