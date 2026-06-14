import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const ADMIN_UNLIMITED_FEATURES: Record<string, string> = {
  max_active_campaigns: '-1',
  whatsapp_providers: 'waha,wasender',
  platform_access: 'true',
}

export const ADMIN_WHATSAPP_PROVIDERS: WhatsAppProvider[] = ['waha', 'wasender']

export async function isPlatformAdmin(userId: string): Promise<boolean> {
  const admin = createServiceRoleClient()
  const { data } = await admin.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role === 'admin'
}

/** Admin-assigned Wasender server or existing Wasender session (no SaaS payload). */
export async function hasWasenderGrandfatherAccess(userId: string): Promise<boolean> {
  const admin = createServiceRoleClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('waha_server_id')
    .eq('id', userId)
    .maybeSingle()

  const assignedId = (profile?.waha_server_id || '').toString().trim()
  if (assignedId) {
    const { data: server } = await admin
      .from('waha_servers')
      .select('provider_type')
      .eq('id', assignedId)
      .maybeSingle()
    if (server?.provider_type === 'wasender') return true
  }

  const { data: sessions } = await admin
    .from('waha_user_sessions')
    .select('provider_type, session_api_key')
    .eq('user_id', userId)
    .limit(5)

  return (sessions ?? []).some(
    (s) => s.provider_type === 'wasender' || Boolean(String(s.session_api_key || '').trim())
  )
}
