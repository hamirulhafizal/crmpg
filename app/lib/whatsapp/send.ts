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
  resolveEffectiveWhatsAppProviderDetailed,
} from '@/app/lib/whatsapp/resolve'
import type { WhatsAppSendImageParams, WhatsAppSendLogContext, WhatsAppSendTextParams } from '@/app/lib/whatsapp/types'

const WAHA_TYPING_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.WAHA_TYPING_TIMEOUT_MS || 8000) || 8000, 2000),
  30000
)

function logWhatsAppSend(step: string, data: Record<string, unknown>) {
  console.log(`[whatsapp-send] ${step}`, data)
}

function sendLogPayload(logContext: WhatsAppSendLogContext | undefined, data: Record<string, unknown>) {
  return {
    ...(logContext ?? {}),
    ...data,
  }
}

async function loadSessionRowForSend(userId: string, sessionName: string) {
  const byName = await loadUserWhatsAppSessionByName(userId, sessionName)
  if (byName) return byName
  return loadUserWhatsAppSession(userId)
}

function phoneToE164(phone: string): string {
  const digits = normalizePhoneToMsisdn(phone)
  return `+${digits}`
}

function summarizeSendError(e: unknown): Record<string, unknown> {
  if (e instanceof WahaApiError) {
    return {
      errName: 'WahaApiError',
      httpStatus: e.status,
      path: e.path,
      error: e.message.slice(0, 500),
      memoizeIdBug: /must include an id property|how we memoize/i.test(e.message),
    }
  }
  if (e instanceof Error) {
    return {
      errName: e.name,
      error: e.message.slice(0, 500),
      memoizeIdBug: /must include an id property|how we memoize/i.test(e.message),
    }
  }
  return { error: String(e).slice(0, 500) }
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
    m.includes('invalid whatsapp number') ||
    // WAHA / WhatsApp Web LID memoize crash — often recovers on @c.us / @s.whatsapp.net
    m.includes('must include an id property') ||
    m.includes('how we memoize') ||
    (m.includes('memoize') && m.includes('undefined'))
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
        if (typeof lid === 'string' && /@lid$/i.test(lid.trim())) {
          console.log('[whatsapp-send] resolveLid:ok', {
            ownerUserId: userId,
            session,
            digitsLast4: digits.slice(-4),
            path,
            lid: lid.trim(),
          })
          return lid.trim()
        }
      }
      console.log('[whatsapp-send] resolveLid:empty', {
        ownerUserId: userId,
        session,
        digitsLast4: digits.slice(-4),
        path,
        dataType: data == null ? 'null' : typeof data,
      })
    } catch (e) {
      if (e instanceof WahaApiError && (e.status === 404 || e.status === 405)) {
        console.log('[whatsapp-send] resolveLid:miss', {
          ownerUserId: userId,
          session,
          digitsLast4: digits.slice(-4),
          path,
          httpStatus: e.status,
        })
        continue
      }
      console.log('[whatsapp-send] resolveLid:fail', {
        ownerUserId: userId,
        session,
        digitsLast4: digits.slice(-4),
        path,
        ...summarizeSendError(e),
      })
    }
  }
  console.log('[whatsapp-send] resolveLid:none', {
    ownerUserId: userId,
    session,
    digitsLast4: digits.slice(-4),
  })
  return null
}

type ResolveChatCandidatesOptions = {
  /**
   * Prefer phone JIDs before @lid. Image sends often crash on LID with
   * "must include an id property" while @c.us still works.
   */
  preferPhoneJidFirst?: boolean
}

async function resolveChatCandidates(
  userId: string,
  session: string,
  phone: string,
  opts?: ResolveChatCandidatesOptions
): Promise<string[]> {
  const digits = normalizePhoneToMsisdn(phone)
  const lidChatId = await resolveWahaLidChatId(userId, session, digits)
  const phoneJids = [`${digits}@c.us`, `${digits}@s.whatsapp.net`]
  if (opts?.preferPhoneJidFirst) {
    return Array.from(new Set([...phoneJids, ...(lidChatId ? [lidChatId] : [])]))
  }
  return Array.from(new Set([...(lidChatId ? [lidChatId] : []), ...phoneJids]))
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

function chatIdKind(chatId: string): string {
  if (chatId.endsWith('@lid')) return 'lid'
  if (chatId.endsWith('@s.whatsapp.net')) return 's.whatsapp.net'
  if (chatId.endsWith('@c.us')) return 'c.us'
  return 'other'
}

async function probeWahaBeforeImageSend(
  userId: string,
  session: string,
  phone: string,
  logContext?: WhatsAppSendLogContext
): Promise<void> {
  const digits = normalizePhoneToMsisdn(phone)
  const sessionDigits = normalizePhoneToMsisdn(session)
  logWhatsAppSend(
    'sendImage:waha:probe',
    sendLogPayload(logContext, {
      ownerUserId: userId,
      session,
      recipientDigits: digits,
      sessionLooksLikePhone: /^\d{10,15}$/.test(sessionDigits),
      sendingToSelf: Boolean(sessionDigits && digits && sessionDigits === digits),
    })
  )

  try {
    const status = await wahaFetch<{ status?: string; name?: string; me?: { id?: string } }>(
      `/api/sessions/${encodeURIComponent(session)}`,
      { method: 'GET' },
      { userId }
    )
    logWhatsAppSend(
      'sendImage:waha:session-status',
      sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        status: status?.status ?? null,
        sessionName: status?.name ?? null,
        meId: status?.me?.id ?? null,
      })
    )
  } catch (e) {
    logWhatsAppSend(
      'sendImage:waha:session-status-fail',
      sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        ...summarizeSendError(e),
      })
    )
  }

  try {
    const exists = await wahaFetch<{ numberExists?: boolean; chatId?: string }>(
      `/api/contacts/check-exists?phone=${encodeURIComponent(digits)}&session=${encodeURIComponent(session)}`,
      { method: 'GET' },
      { userId }
    )
    logWhatsAppSend(
      'sendImage:waha:check-exists',
      sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        phoneLast4: digits.slice(-4),
        numberExists: exists?.numberExists ?? null,
        existsChatId: exists?.chatId ?? null,
      })
    )
  } catch (e) {
    logWhatsAppSend(
      'sendImage:waha:check-exists-fail',
      sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        phoneLast4: digits.slice(-4),
        ...summarizeSendError(e),
      })
    )
  }
}

async function sendWahaImageToChatCandidates(
  userId: string,
  session: string,
  chatCandidates: string[],
  file: { mimetype: string; filename: string; data: string },
  caption?: string,
  logContext?: WhatsAppSendLogContext
): Promise<void> {
  const base64Len = file.data?.length ?? 0
  const approxJsonBytes = base64Len + (caption?.length ?? 0) + 256
  logWhatsAppSend(
    'sendImage:waha:payload',
    sendLogPayload(logContext, {
      ownerUserId: userId,
      session,
      mimetype: file.mimetype,
      filename: file.filename,
      base64Len,
      approxJsonKB: Math.round(approxJsonBytes / 1024),
      captionLen: caption?.length ?? 0,
      hasCaption: Boolean(caption),
      candidateCount: chatCandidates.length,
    })
  )

  let lastErr: unknown = null
  let allMemoize = true
  let anyAttempt = false
  for (let i = 0; i < chatCandidates.length; i++) {
    const chatId = chatCandidates[i]!
    const startedAt = Date.now()
    anyAttempt = true
    try {
      logWhatsAppSend(
        'sendImage:waha:try',
        sendLogPayload(logContext, {
          ownerUserId: userId,
          session,
          chatId,
          attempt: i + 1,
          of: chatCandidates.length,
          chatKind: chatIdKind(chatId),
        })
      )
      await wahaFetch(
        '/api/sendImage',
        {
          method: 'POST',
          body: JSON.stringify({ session, chatId, file, ...(caption ? { caption } : {}) }),
        },
        { userId }
      )
      logWhatsAppSend(
        'sendImage:waha:chat-ok',
        sendLogPayload(logContext, {
          ownerUserId: userId,
          session,
          chatId,
          attempt: i + 1,
          elapsedMs: Date.now() - startedAt,
        })
      )
      return
    } catch (e) {
      lastErr = e
      const summary = summarizeSendError(e)
      if (!summary.memoizeIdBug) allMemoize = false
      logWhatsAppSend(
        'sendImage:waha:chat-fail',
        sendLogPayload(logContext, {
          ownerUserId: userId,
          session,
          chatId,
          attempt: i + 1,
          of: chatCandidates.length,
          chatKind: chatIdKind(chatId),
          elapsedMs: Date.now() - startedAt,
          retryable: isRetryableSendChatError(e),
          ...summary,
        })
      )
      if (isRetryableSendChatError(e)) continue
      throw e
    }
  }

  if (anyAttempt) {
    logWhatsAppSend(
      'sendImage:waha:all-candidates-failed',
      sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        candidates: chatCandidates,
        allMemoizeIdBug: allMemoize,
        hint: allMemoize
          ? 'Same memoize/id error on every JID — likely WAHA/WhatsApp Web engine or image payload size, not chatId format'
          : 'Mixed errors across JIDs — inspect per-attempt httpStatus/error',
        ...summarizeSendError(lastErr),
      })
    )
  }
  if (lastErr) throw lastErr
}

export async function sendWhatsAppText(params: WhatsAppSendTextParams): Promise<void> {
  const { userId, session, phone, text, logContext } = params
  const enableTyping = params.enableTyping !== false
  const randomizeSpaces = params.randomizeSpaces !== false
  const outbound = randomizeSpaces ? humanizeWhatsAppText(text) : text
  const cfg = await getWhatsAppServerConfig({ userId })
  const sessionRow = await loadSessionRowForSend(userId, session)
  const { provider, reason } = resolveEffectiveWhatsAppProviderDetailed(cfg, sessionRow)

  logWhatsAppSend(
    'sendText:start',
    sendLogPayload(logContext, {
      ownerUserId: userId,
      session,
      phoneLast4: phone.slice(-4),
      cfgProvider: cfg.provider,
      cfgServerId: cfg.serverId,
      cfgBaseUrl: cfg.baseUrl,
      sessionProviderType: sessionRow?.provider_type ?? null,
      sessionHasApiKey: Boolean(sessionRow?.session_api_key?.trim()),
      effectiveProvider: provider,
      effectiveReason: reason,
      textLength: outbound.length,
    })
  )

  if (provider === 'wasender') {
    if (!sessionRow?.session_api_key) {
      logWhatsAppSend('sendText:abort', sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        reason: 'wasender path but session_api_key missing',
        sessionProviderType: sessionRow?.provider_type ?? null,
        cfgProvider: cfg.provider,
      }))
      throw new WhatsAppApiError(
        'Wasender session API key missing. Open WhatsApp Integration and reconnect.',
        400,
        '/api/send-message',
        'wasender'
      )
    }
    logWhatsAppSend('sendText:wasender', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
    if (enableTyping) await runWasenderTypingIndicator(userId, session, phone, outbound.length)
    await wasenderSendText(cfg, sessionRow.session_api_key, phoneToE164(phone), outbound)
    logWhatsAppSend('sendText:wasender:ok', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
    return
  }

  logWhatsAppSend('sendText:waha:resolve-chat', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
  const chatCandidates = await resolveChatCandidates(userId, session, phone)
  logWhatsAppSend('sendText:waha:chat-candidates', sendLogPayload(logContext, { ownerUserId: userId, session, candidates: chatCandidates }))
  if (enableTyping && chatCandidates[0]) {
    await runWahaTypingIndicator(userId, session, chatCandidates[0], outbound.length)
  }
  await sendWahaTextToChatCandidates(userId, session, chatCandidates, outbound)
  logWhatsAppSend('sendText:waha:ok', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
}

export async function sendWhatsAppImage(params: WhatsAppSendImageParams): Promise<void> {
  const { userId, session, phone, imageBytes, logContext } = params
  if (!Buffer.isBuffer(imageBytes) || imageBytes.length === 0) {
    throw new Error('Rendered image is empty (0 bytes)')
  }
  const caption = params.caption?.trim() || undefined
  const enableTyping = params.enableTyping !== false
  const mimetype = params.mimetype ?? 'image/png'
  const filename = params.filename ?? 'image.png'
  const cfg = await getWhatsAppServerConfig({ userId })
  const sessionRow = await loadSessionRowForSend(userId, session)
  const { provider, reason } = resolveEffectiveWhatsAppProviderDetailed(cfg, sessionRow)

  const recipientDigits = normalizePhoneToMsisdn(phone)
  logWhatsAppSend(
    'sendImage:start',
    sendLogPayload(logContext, {
      ownerUserId: userId,
      session,
      phoneLast4: recipientDigits.slice(-4),
      recipientDigits,
      cfgProvider: cfg.provider,
      cfgBaseUrl: cfg.baseUrl,
      cfgServerId: cfg.serverId,
      sessionProviderType: sessionRow?.provider_type ?? null,
      effectiveProvider: provider,
      effectiveReason: reason,
      bytes: imageBytes.length,
      bytesKB: Math.round(imageBytes.length / 1024),
      mimetype,
      filename,
      captionLen: caption?.length ?? 0,
    })
  )

  if (provider === 'wasender') {
    if (!sessionRow?.session_api_key) {
      logWhatsAppSend('sendImage:abort', sendLogPayload(logContext, {
        ownerUserId: userId,
        session,
        reason: 'wasender path but session_api_key missing',
      }))
      throw new WhatsAppApiError(
        'Wasender session API key missing. Open WhatsApp Integration and reconnect.',
        400,
        '/api/send-message',
        'wasender'
      )
    }
    logWhatsAppSend('sendImage:wasender', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
    if (enableTyping && caption) await runWasenderTypingIndicator(userId, session, phone, caption.length)
    const publicUrl = await wasenderUploadMedia(cfg, sessionRow.session_api_key, imageBytes, mimetype)
    await wasenderSendImage(cfg, sessionRow.session_api_key, phoneToE164(phone), publicUrl, caption)
    logWhatsAppSend('sendImage:wasender:ok', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: phone.slice(-4) }))
    return
  }

  logWhatsAppSend('sendImage:waha', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: recipientDigits.slice(-4) }))
  await probeWahaBeforeImageSend(userId, session, phone, logContext)
  // Phone JIDs first: LID often throws WAHA memoize/"id property" on sendImage while @c.us works.
  const chatCandidates = await resolveChatCandidates(userId, session, phone, {
    preferPhoneJidFirst: true,
  })
  logWhatsAppSend(
    'sendImage:waha:chat-candidates',
    sendLogPayload(logContext, {
      ownerUserId: userId,
      session,
      candidates: chatCandidates,
      kinds: chatCandidates.map(chatIdKind),
    })
  )
  if (enableTyping && caption && chatCandidates[0]) {
    await runWahaTypingIndicator(userId, session, chatCandidates[0], caption.length)
  }
  const base64 = imageBytes.toString('base64')
  await sendWahaImageToChatCandidates(
    userId,
    session,
    chatCandidates,
    { mimetype, filename, data: base64 },
    caption,
    logContext
  )
  logWhatsAppSend('sendImage:waha:ok', sendLogPayload(logContext, { ownerUserId: userId, session, phoneLast4: recipientDigits.slice(-4) }))
}

/** Refresh live status for stored user sessions (both providers). */
export async function refreshUserSessionStatuses(userId: string): Promise<void> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const rows = await loadUserWhatsAppSessions(userId)
  if (rows.length === 0) return

  const { createServiceRoleClient } = await import('@/app/lib/supabase/service-role')
  const admin = createServiceRoleClient()

  if (cfg.provider === 'wasender' || resolveEffectiveWhatsAppProviderDetailed(cfg, rows[0]).provider === 'wasender') {
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
