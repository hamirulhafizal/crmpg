import { mapWasenderStatusToDisplay, wasenderGetSessionStatus } from '@/app/lib/wasender'
import { wahaFetch } from '@/app/lib/waha'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSession,
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

  if (cfg.provider === 'wasender') {
    const row = await loadUserWhatsAppSession(userId)
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
