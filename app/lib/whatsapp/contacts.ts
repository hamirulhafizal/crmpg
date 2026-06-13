import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { wasenderCheckOnWhatsApp, wasenderGetContactPicture } from '@/app/lib/wasender'
import { wahaFetch, WahaApiError } from '@/app/lib/waha'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSession,
} from '@/app/lib/whatsapp/resolve'
import type { WhatsAppLabel } from '@/app/lib/whatsapp/types'

export async function fetchWhatsAppLabels(
  userId: string,
  sessionName: string,
  phone: string
): Promise<{ labels: WhatsAppLabel[]; chatId: string; message?: string }> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const msisdn = normalizePhoneToMsisdn(phone)
  const chatId = `${msisdn}@c.us`

  if (cfg.provider === 'wasender') {
    return {
      labels: [],
      chatId,
      message: 'WhatsApp labels are not available on Wasender. Use CRM tags instead.',
    }
  }

  const encS = encodeURIComponent(sessionName)
  const labelPaths = [
    `/api/${encS}/labels/chats/${encodeURIComponent(chatId)}`,
    `/api/sessions/${encS}/labels/chats/${encodeURIComponent(chatId)}`,
  ]

  for (const path of labelPaths) {
    try {
      const data = await wahaFetch<WhatsAppLabel[]>(path, {}, { userId })
      return { labels: Array.isArray(data) ? data : [], chatId }
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
      throw e
    }
  }

  return {
    labels: [],
    chatId,
    message: 'WhatsApp labels API returned 404 for all known paths.',
  }
}

export async function fetchWhatsAppProfilePicture(
  userId: string,
  sessionName: string,
  phone: string
): Promise<{ url: string | null; provider: string }> {
  const cfg = await getWhatsAppServerConfig({ userId })

  if (cfg.provider === 'wasender') {
    const row = await loadUserWhatsAppSession(userId)
    if (!row?.session_api_key) return { url: null, provider: 'wasender' }
    const url = await wasenderGetContactPicture(cfg, row.session_api_key, phone)
    return { url, provider: 'wasender' }
  }

  const msisdn = normalizePhoneToMsisdn(phone)
  const encS = encodeURIComponent(sessionName)
  const result = await wahaFetch<{ profilePictureURL?: string; url?: string }>(
    `/api/contacts/profile-picture?contactId=${encodeURIComponent(`${msisdn}@c.us`)}&session=${encS}`,
    { method: 'GET' },
    { userId }
  )
  const url = result?.profilePictureURL || result?.url || null
  return { url, provider: 'waha' }
}

export async function checkWhatsAppNumberExists(
  userId: string,
  phone: string
): Promise<boolean> {
  const cfg = await getWhatsAppServerConfig({ userId })
  if (cfg.provider === 'wasender') {
    const row = await loadUserWhatsAppSession(userId)
    if (!row?.session_api_key) return false
    return wasenderCheckOnWhatsApp(cfg, row.session_api_key, phone)
  }

  const row = await loadUserWhatsAppSession(userId)
  const session = row?.session_name || ''
  if (!session) return false
  const digits = normalizePhoneToMsisdn(phone)
  try {
    const data = await wahaFetch<{ numberExists?: boolean }>(
      `/api/contacts/check-exists?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(session)}`,
      { method: 'GET' },
      { userId }
    )
    return Boolean(data?.numberExists)
  } catch {
    return false
  }
}

export async function listWhatsAppGroups(userId: string, sessionName: string): Promise<unknown[]> {
  const cfg = await getWhatsAppServerConfig({ userId })
  if (cfg.provider === 'wasender') {
    const row = await loadUserWhatsAppSession(userId)
    if (!row?.session_api_key) return []
    const { wasenderListGroups } = await import('@/app/lib/wasender')
    return wasenderListGroups(cfg, row.session_api_key)
  }

  const paths = [
    `/api/${encodeURIComponent(sessionName)}/groups`,
    `/api/sessions/${encodeURIComponent(sessionName)}/groups`,
  ]
  for (const p of paths) {
    try {
      const data = await wahaFetch<unknown>(p, { method: 'GET' }, { userId })
      if (Array.isArray(data)) return data
      if (data && typeof data === 'object' && Array.isArray((data as { groups?: unknown[] }).groups)) {
        return (data as { groups: unknown[] }).groups
      }
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
    }
  }
  return []
}
