import { mapWasenderStatusToDisplay, wasenderGetSessionStatus } from '@/app/lib/wasender'
import { wahaFetch } from '@/app/lib/waha'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSession,
  loadUserWhatsAppSessionByName,
  resolveEffectiveWhatsAppProvider,
} from '@/app/lib/whatsapp/resolve'

export function normalizeWhatsAppSessionStatus(status: string | null | undefined): string {
  return (status || '').trim().toUpperCase()
}

export function isWorkingWhatsAppSessionStatus(status: string | null | undefined): boolean {
  const s = normalizeWhatsAppSessionStatus(status)
  return s === 'WORKING' || s === 'CONNECTED'
}

export async function fetchLiveWhatsAppSessionStatus(
  userId: string,
  sessionName: string
): Promise<string> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const row =
    (await loadUserWhatsAppSessionByName(userId, sessionName)) ??
    (await loadUserWhatsAppSession(userId))
  const provider = resolveEffectiveWhatsAppProvider(cfg, row)

  if (provider === 'wasender') {
    if (!row?.session_api_key) return 'DISCONNECTED'
    const raw = await wasenderGetSessionStatus(cfg, row.session_api_key)
    return mapWasenderStatusToDisplay(raw)
  }

  const waSession = await wahaFetch<{ status?: string }>(
    `/api/sessions/${encodeURIComponent(sessionName)}`,
    {},
    { userId }
  )
  return normalizeWhatsAppSessionStatus(waSession?.status)
}

export async function persistWhatsAppSessionStatus(
  userId: string,
  sessionName: string,
  status: string
): Promise<void> {
  const admin = createServiceRoleClient()
  await admin
    .from('waha_user_sessions')
    .update({
      last_known_waha_status: normalizeWhatsAppSessionStatus(status),
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('session_name', sessionName)
}

/** Live provider status + DB sync (cron/UI should use this, not stale last_known_waha_status). */
export async function refreshWhatsAppSessionStatus(
  userId: string,
  sessionName: string
): Promise<string> {
  const status = await fetchLiveWhatsAppSessionStatus(userId, sessionName)
  await persistWhatsAppSessionStatus(userId, sessionName, status)
  return status
}
