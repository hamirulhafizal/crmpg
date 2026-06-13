import {
  humanizeWhatsAppText,
  isTypingChatNotFoundError,
  randomDelayBetween,
  sleep,
  typingDelayBounds,
} from '@/app/lib/campaigns/whatsapp-humanize'
import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import {
  mapWasenderStatusToDisplay,
  wasenderGetSessionStatus,
  wasenderSendImage,
  wasenderSendPresence,
  wasenderSendText,
  wasenderUploadMedia,
} from '@/app/lib/wasender'
import { wahaFetch, WahaApiError } from '@/app/lib/waha'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSession,
  loadUserWhatsAppSessionByName,
  loadUserWhatsAppSessions,
  resolveEffectiveWhatsAppProvider,
} from '@/app/lib/whatsapp/resolve'
import type { WhatsAppSendImageParams, WhatsAppSendTextParams } from '@/app/lib/whatsapp/types'

const WAHA_TYPING_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.WAHA_TYPING_TIMEOUT_MS || 8000) || 8000, 2000),
  30000
)

async function loadSessionRowForSend(userId: string, sessionName: string) {
  const byName = await loadUserWhatsAppSessionByName(userId, sessionName)
  if (byName) return byName
  return loadUserWhatsAppSession(userId)
}

function phoneToE164(phone: string): string {
  const digits = normalizePhoneToMsisdn(phone)
  return `+${digits}`
}

function isRetryableSendChatError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : JSON.stringify(error)
  const m = message.toLowerCase()
  return (
    m.includes('chat not found') ||
    m.includes('chat_not_found') ||
    m.includes('unknown chat') ||
    m.includes('no lid for user') ||
    m.includes('no lid') ||
    m.includes('invalid whatsapp number')
  )
}

async function resolveWahaLidChatId(userId: string, session: string, digits: string): Promise<string | null> {
  const encSession = encodeURIComponent(session)
  const candidates = [
    `/api/${encSession}/lids/pn/${encodeURIComponent(digits)}`,
    `/api/${encSession}/lids/pn/${encodeURIComponent(`${digits}@c.us`)}`,
    `/api/sessions/${encSession}/lids/pn/${encodeURIComponent(digits)}`,
  ]
  for (const path of candidates) {
    try {
      const data = await wahaFetch<unknown>(path, { method: 'GET' }, { userId })
      if (data && typeof data === 'object') {
        const lid = (data as Record<string, unknown>).lid
        if (typeof lid === 'string' && /@lid$/i.test(lid.trim())) return lid.trim()
      }
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) continue
    }
  }
  return null
}

async function resolveChatCandidates(userId: string, session: string, phone: string): Promise<string[]> {
  const digits = normalizePhoneToMsisdn(phone)
  const lidChatId = await resolveWahaLidChatId(userId, session, digits)
  return Array.from(
    new Set([...(lidChatId ? [lidChatId] : []), `${digits}@c.us`, `${digits}@s.whatsapp.net`])
  )
}

async function runWahaTypingIndicator(
  userId: string,
  session: string,
  chatId: string,
  textLength: number
): Promise<void> {
  const { minMs, maxMs } = typingDelayBounds(textLength)
  const typingBody = JSON.stringify({ session, chatId })
  try {
    await Promise.race([
      wahaFetch('/api/startTyping', { method: 'POST', body: typingBody }, { userId }),
      sleep(WAHA_TYPING_TIMEOUT_MS).then(() => {
        throw new WahaApiError(
          `WAHA startTyping timed out after ${WAHA_TYPING_TIMEOUT_MS}ms`,
          408,
          '/api/startTyping'
        )
      }),
    ])
  } catch (e) {
    if (!isTypingChatNotFoundError(e)) console.warn('[whatsapp] startTyping failed; continuing:', e)
  }
  await randomDelayBetween(minMs, maxMs)
  try {
    await Promise.race([
      wahaFetch('/api/stopTyping', { method: 'POST', body: typingBody }, { userId }),
      sleep(WAHA_TYPING_TIMEOUT_MS).then(() => {
        throw new WahaApiError(
          `WAHA stopTyping timed out after ${WAHA_TYPING_TIMEOUT_MS}ms`,
          408,
          '/api/stopTyping'
        )
      }),
    ])
  } catch (e) {
    if (!isTypingChatNotFoundError(e)) console.warn('[whatsapp] stopTyping failed; continuing:', e)
  }
}

async function runWasenderTypingIndicator(
  userId: string,
  sessionName: string,
  phone: string,
  textLength: number
): Promise<void> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const row = await loadSessionRowForSend(userId, sessionName)
  if (!row?.session_api_key) return
  const digits = normalizePhoneToMsisdn(phone)
  const jid = `${digits}@s.whatsapp.net`
  const { minMs, maxMs } = typingDelayBounds(textLength)
  try {
    await wasenderSendPresence(cfg, row.session_api_key, jid, 'composing')
  } catch (e) {
    console.warn('[whatsapp] wasender composing failed; continuing:', e)
  }
  await randomDelayBetween(minMs, maxMs)
}

async function sendWahaTextToChatCandidates(
  userId: string,
  session: string,
  chatCandidates: string[],
  text: string
): Promise<void> {
  let lastErr: unknown = null
  for (const chatId of chatCandidates) {
    try {
      await wahaFetch(
        '/api/sendText',
        { method: 'POST', body: JSON.stringify({ session, chatId, text }) },
        { userId }
      )
      return
    } catch (e) {
      lastErr = e
      if (isRetryableSendChatError(e)) continue
      throw e
    }
  }
  if (lastErr) throw lastErr
}

async function sendWahaImageToChatCandidates(
  userId: string,
  session: string,
  chatCandidates: string[],
  file: { mimetype: string; filename: string; data: string },
  caption?: string
): Promise<void> {
  let lastErr: unknown = null
  for (const chatId of chatCandidates) {
    try {
      await wahaFetch(
        '/api/sendImage',
        {
          method: 'POST',
          body: JSON.stringify({ session, chatId, file, ...(caption ? { caption } : {}) }),
        },
        { userId }
      )
      return
    } catch (e) {
      lastErr = e
      if (isRetryableSendChatError(e)) continue
      throw e
    }
  }
  if (lastErr) throw lastErr
}

export async function sendWhatsAppText(params: WhatsAppSendTextParams): Promise<void> {
  const { userId, session, phone, text } = params
  const enableTyping = params.enableTyping !== false
  const randomizeSpaces = params.randomizeSpaces !== false
  const outbound = randomizeSpaces ? humanizeWhatsAppText(text) : text
  const cfg = await getWhatsAppServerConfig({ userId })
  const sessionRow = await loadSessionRowForSend(userId, session)
  const provider = resolveEffectiveWhatsAppProvider(cfg, sessionRow)

  if (provider === 'wasender') {
    if (!sessionRow?.session_api_key) {
      throw new WhatsAppApiError(
        'Wasender session API key missing. Open WhatsApp Integration and reconnect.',
        400,
        '/api/send-message',
        'wasender'
      )
    }
    if (enableTyping) await runWasenderTypingIndicator(userId, session, phone, outbound.length)
    await wasenderSendText(cfg, sessionRow.session_api_key, phoneToE164(phone), outbound)
    return
  }

  const chatCandidates = await resolveChatCandidates(userId, session, phone)
  if (enableTyping && chatCandidates[0]) {
    await runWahaTypingIndicator(userId, session, chatCandidates[0], outbound.length)
  }
  await sendWahaTextToChatCandidates(userId, session, chatCandidates, outbound)
}

export async function sendWhatsAppImage(params: WhatsAppSendImageParams): Promise<void> {
  const { userId, session, phone, imageBytes } = params
  if (!Buffer.isBuffer(imageBytes) || imageBytes.length === 0) {
    throw new Error('Rendered image is empty (0 bytes)')
  }
  const caption = params.caption?.trim() || undefined
  const enableTyping = params.enableTyping !== false
  const mimetype = params.mimetype ?? 'image/png'
  const filename = params.filename ?? 'image.png'
  const cfg = await getWhatsAppServerConfig({ userId })
  const sessionRow = await loadSessionRowForSend(userId, session)
  const provider = resolveEffectiveWhatsAppProvider(cfg, sessionRow)

  if (provider === 'wasender') {
    if (!sessionRow?.session_api_key) {
      throw new WhatsAppApiError(
        'Wasender session API key missing. Open WhatsApp Integration and reconnect.',
        400,
        '/api/send-message',
        'wasender'
      )
    }
    if (enableTyping && caption) await runWasenderTypingIndicator(userId, session, phone, caption.length)
    const publicUrl = await wasenderUploadMedia(cfg, sessionRow.session_api_key, imageBytes, mimetype)
    await wasenderSendImage(cfg, sessionRow.session_api_key, phoneToE164(phone), publicUrl, caption)
    return
  }

  const chatCandidates = await resolveChatCandidates(userId, session, phone)
  if (enableTyping && caption && chatCandidates[0]) {
    await runWahaTypingIndicator(userId, session, chatCandidates[0], caption.length)
  }
  await sendWahaImageToChatCandidates(
    userId,
    session,
    chatCandidates,
    { mimetype, filename, data: imageBytes.toString('base64') },
    caption
  )
}

/** Refresh live status for stored user sessions (both providers). */
export async function refreshUserSessionStatuses(userId: string): Promise<void> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const rows = await loadUserWhatsAppSessions(userId)
  if (rows.length === 0) return

  const { createServiceRoleClient } = await import('@/app/lib/supabase/service-role')
  const admin = createServiceRoleClient()

  if (cfg.provider === 'wasender' || resolveEffectiveWhatsAppProvider(cfg, rows[0]) === 'wasender') {
    for (const row of rows) {
      if (!row.session_api_key) continue
      try {
        const raw = await wasenderGetSessionStatus(cfg, row.session_api_key)
        const display = mapWasenderStatusToDisplay(raw)
        await admin
          .from('waha_user_sessions')
          .update({ last_known_waha_status: display, updated_at: new Date().toISOString() })
          .eq('id', row.id)
      } catch {
        // ignore per-row failures
      }
    }
    return
  }

  const allSessions = await wahaFetch<Array<{ name?: string; status?: string }>>(
    '/api/sessions?all=true',
    {},
    { userId }
  )
  const byName = new Map(
    (Array.isArray(allSessions) ? allSessions : []).map((s) => [(s.name || '').trim(), (s.status || '').trim()])
  )
  for (const row of rows) {
    const status = byName.get(row.session_name) || 'STOPPED'
    await admin
      .from('waha_user_sessions')
      .update({ last_known_waha_status: status, updated_at: new Date().toISOString() })
      .eq('id', row.id)
  }
}
