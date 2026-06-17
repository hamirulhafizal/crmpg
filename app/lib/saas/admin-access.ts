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

/** @deprecated Use hasAdminWasenderServerOverride from whatsapp-access.ts */
export async function hasWasenderGrandfatherAccess(userId: string): Promise<boolean> {
  const { hasAdminWasenderServerOverride } = await import('@/app/lib/saas/whatsapp-access')
  return hasAdminWasenderServerOverride(userId)
}
