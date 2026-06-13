import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import type { WhatsAppServerConfig } from '@/app/lib/whatsapp/types'

type WasenderEnvelope<T> = {
  success?: boolean
  data?: T
  message?: string
  error?: string
}

function parseErrorBody(text: string, status: number): string {
  const trimmed = text.trim()
  if (!trimmed) return `Wasender HTTP ${status}`
  try {
    const json = JSON.parse(trimmed) as Record<string, unknown>
    const msg = json.message ?? json.error ?? json.detail
    if (typeof msg === 'string' && msg.trim()) return msg.trim()
  } catch {
    // not json
  }
  const oneLine = trimmed.replace(/\s+/g, ' ')
  return oneLine.length <= 200 ? oneLine : `${oneLine.slice(0, 197)}…`
}

async function wasenderHttp<T>(
  cfg: WhatsAppServerConfig,
  path: string,
  apiKey: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${cfg.baseUrl}${path.startsWith('/') ? path : `/${path}`}`
  const timeoutMs = Math.min(
    Math.max(Number(process.env.WASENDER_FETCH_TIMEOUT_MS || 90000) || 90000, 5000),
    300000
  )
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? ac.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        ...options.headers,
      },
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new WhatsAppApiError(`Wasender request timed out (${path})`, 408, path, 'wasender')
    }
    throw e
  } finally {
    clearTimeout(t)
  }

  const text = await res.text()
  if (!res.ok) {
    throw new WhatsAppApiError(parseErrorBody(text, res.status), res.status, path, 'wasender')
  }
  if (!text) return undefined as T
  try {
    return JSON.parse(text) as T
  } catch {
    return undefined as T
  }
}

export async function wasenderPlatformFetch<T>(
  cfg: WhatsAppServerConfig,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return wasenderHttp<T>(cfg, path, cfg.platformApiKey, options)
}

export async function wasenderSessionFetch<T>(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<T> {
  return wasenderHttp<T>(cfg, path, sessionApiKey, options)
}

export type WasenderSessionData = {
  id: number | string
  name: string
  phone_number?: string
  status?: string
  api_key?: string
}

export async function wasenderCreateSession(
  cfg: WhatsAppServerConfig,
  input: { name: string; phoneNumber: string }
): Promise<WasenderSessionData> {
  const res = await wasenderPlatformFetch<WasenderEnvelope<WasenderSessionData>>(
    cfg,
    '/api/whatsapp-sessions',
    {
      method: 'POST',
      body: JSON.stringify({
        name: input.name,
        phone_number: input.phoneNumber.startsWith('+') ? input.phoneNumber : `+${input.phoneNumber}`,
        account_protection: true,
        log_messages: true,
        read_incoming_messages: false,
        webhook_enabled: false,
      }),
    }
  )
  if (!res?.data) throw new WhatsAppApiError('Wasender did not return session data', 500, '/api/whatsapp-sessions', 'wasender')
  return res.data
}

export async function wasenderConnectSession(cfg: WhatsAppServerConfig, sessionId: string): Promise<{ status?: string; qrCode?: string }> {
  const res = await wasenderPlatformFetch<WasenderEnvelope<{ status?: string; qrCode?: string }>>(
    cfg,
    `/api/whatsapp-sessions/${encodeURIComponent(sessionId)}/connect`,
    { method: 'POST', body: '{}' }
  )
  return res?.data ?? {}
}

export async function wasenderGetQrCode(cfg: WhatsAppServerConfig, sessionId: string): Promise<string | null> {
  const res = await wasenderPlatformFetch<WasenderEnvelope<{ qrCode?: string }>>(
    cfg,
    `/api/whatsapp-sessions/${encodeURIComponent(sessionId)}/qrcode`,
    { method: 'GET' }
  )
  return res?.data?.qrCode?.trim() || null
}

export async function wasenderGetSessionStatus(cfg: WhatsAppServerConfig, sessionApiKey: string): Promise<string> {
  const res = await wasenderSessionFetch<WasenderEnvelope<{ status?: string }> | { status?: string }>(
    cfg,
    sessionApiKey,
    '/api/status',
    { method: 'GET' }
  )
  if (res && typeof res === 'object' && 'data' in res && res.data && typeof res.data === 'object') {
    const nested = res.data as { status?: string }
    if (nested.status) return nested.status.toString()
  }
  const flat = res as { status?: string }
  return (flat?.status || 'disconnected').toString()
}

export async function wasenderDisconnectSession(cfg: WhatsAppServerConfig, sessionId: string): Promise<void> {
  await wasenderPlatformFetch(cfg, `/api/whatsapp-sessions/${encodeURIComponent(sessionId)}/disconnect`, {
    method: 'POST',
    body: '{}',
  })
}

export async function wasenderDeleteSession(cfg: WhatsAppServerConfig, sessionId: string): Promise<void> {
  await wasenderPlatformFetch(cfg, `/api/whatsapp-sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function wasenderSendText(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  to: string,
  text: string
): Promise<void> {
  const phone = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`
  await wasenderSessionFetch(cfg, sessionApiKey, '/api/send-message', {
    method: 'POST',
    body: JSON.stringify({ to: phone, text }),
  })
}

export async function wasenderUploadMedia(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  imageBytes: Buffer,
  mimetype: string
): Promise<string> {
  const res = await wasenderSessionFetch<{ success?: boolean; publicUrl?: string }>(
    cfg,
    sessionApiKey,
    '/api/upload',
    {
      method: 'POST',
      body: JSON.stringify({
        mimetype,
        base64: imageBytes.toString('base64'),
      }),
    }
  )
  const url = res?.publicUrl?.trim()
  if (!url) {
    throw new WhatsAppApiError('Wasender upload did not return publicUrl', 500, '/api/upload', 'wasender')
  }
  return url
}

export async function wasenderSendImage(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  to: string,
  imageUrl: string,
  caption?: string
): Promise<void> {
  const phone = to.startsWith('+') ? to : `+${to.replace(/\D/g, '')}`
  await wasenderSessionFetch(cfg, sessionApiKey, '/api/send-message', {
    method: 'POST',
    body: JSON.stringify({
      to: phone,
      imageUrl,
      ...(caption ? { text: caption } : {}),
    }),
  })
}

export async function wasenderSendPresence(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  jid: string,
  type: 'composing' | 'recording' | 'available' | 'unavailable',
  delayMs?: number
): Promise<void> {
  await wasenderSessionFetch(cfg, sessionApiKey, '/api/send-presence-update', {
    method: 'POST',
    body: JSON.stringify({ jid, type, ...(delayMs ? { delayMs } : {}) }),
  })
}

export async function wasenderCheckOnWhatsApp(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  phone: string
): Promise<boolean> {
  const e164 = phone.startsWith('+') ? phone.slice(1) : phone.replace(/\D/g, '')
  const res = await wasenderSessionFetch<WasenderEnvelope<{ exists?: boolean }>>(
    cfg,
    sessionApiKey,
    `/api/on-whatsapp/${encodeURIComponent(e164)}`,
    { method: 'GET' }
  )
  return Boolean(res?.data?.exists)
}

export async function wasenderGetContactPicture(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  phone: string
): Promise<string | null> {
  const digits = phone.replace(/\D/g, '')
  const res = await wasenderSessionFetch<WasenderEnvelope<{ imgUrl?: string }>>(
    cfg,
    sessionApiKey,
    `/api/contacts/${encodeURIComponent(digits)}/picture`,
    { method: 'GET' }
  )
  return res?.data?.imgUrl?.trim() || null
}

export async function wasenderListGroups(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string
): Promise<Array<{ jid?: string; name?: string; imgUrl?: string | null }>> {
  const res = await wasenderSessionFetch<WasenderEnvelope<Array<{ jid?: string; name?: string; imgUrl?: string | null }>>>(
    cfg,
    sessionApiKey,
    '/api/groups',
    { method: 'GET' }
  )
  return Array.isArray(res?.data) ? res.data : []
}

export async function wasenderGetMessageLogs(
  cfg: WhatsAppServerConfig,
  sessionApiKey: string,
  externalSessionId: string,
  page = 1,
  perPage = 50
): Promise<Array<{ id?: string; to?: string | null; content?: string | null; status?: string; created_at?: string }>> {
  const res = await wasenderSessionFetch<
    WasenderEnvelope<{
      data?: Array<{ id?: string; to?: string | null; content?: string | null; status?: string; created_at?: string }>
    }>
  >(
    cfg,
    sessionApiKey,
    `/api/whatsapp-sessions/${encodeURIComponent(externalSessionId)}/message-logs?page=${page}&per_page=${perPage}`,
    { method: 'GET' }
  )
  const rows = res?.data?.data
  return Array.isArray(rows) ? rows : []
}

/** Map Wasender status to CRM display status (aligned with WAHA WORKING / STOPPED). */
export function mapWasenderStatusToDisplay(status: string): string {
  const s = status.toLowerCase().replace(/-/g, '_')
  if (s === 'connected') return 'WORKING'
  if (s === 'need_scan') return 'SCAN_QR'
  if (s === 'connecting') return 'STARTING'
  if (s === 'logged_out' || s === 'expired') return 'FAILED'
  return s.toUpperCase()
}

export function mapDisplayStatusToWasender(status: string): string {
  const s = status.toUpperCase()
  if (s === 'WORKING') return 'connected'
  if (s === 'SCAN_QR') return 'need_scan'
  if (s === 'STARTING') return 'connecting'
  return status.toLowerCase()
}
