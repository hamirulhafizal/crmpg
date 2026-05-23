import { humanizeWhatsAppText, isTypingChatNotFoundError, randomDelayBetween, typingDelayBounds } from '@/app/lib/campaigns/whatsapp-humanize'
import { wahaFetch, WahaApiError } from '@/app/lib/waha'
import type { WhatsAppSendOptions } from '@/app/lib/campaigns/whatsapp-send-options'

export type CampaignWhatsAppSendOpts = Partial<WhatsAppSendOptions>

function normalisePhoneToMsisdn(phone: string): string {
  let digits = phone.replace(/[^0-9]/g, '')
  if (!digits.startsWith('60')) {
    if (digits.startsWith('0')) {
      digits = `60${digits.slice(1)}`
    } else {
      digits = `60${digits}`
    }
  }
  return digits
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
    m.includes('no lid')
  )
}

async function resolveWahaLidChatId(
  userId: string,
  session: string,
  digits: string
): Promise<string | null> {
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

async function resolveChatCandidates(
  userId: string,
  session: string,
  phone: string
): Promise<string[]> {
  const digits = normalisePhoneToMsisdn(phone)
  const lidChatId = await resolveWahaLidChatId(userId, session, digits)
  return Array.from(
    new Set([...(lidChatId ? [lidChatId] : []), `${digits}@c.us`, `${digits}@s.whatsapp.net`])
  )
}

async function runTypingIndicator(
  userId: string,
  session: string,
  chatId: string,
  textLength: number
): Promise<void> {
  const { minMs, maxMs } = typingDelayBounds(textLength)

  try {
    await wahaFetch(
      '/api/startTyping',
      {
        method: 'POST',
        body: JSON.stringify({ session, chatId }),
      },
      { userId }
    )
  } catch (e) {
    if (isTypingChatNotFoundError(e)) {
      console.info('[campaign] startTyping skipped: chat not found')
    } else {
      console.warn('[campaign] startTyping failed; continuing:', e)
    }
  }

  await randomDelayBetween(minMs, maxMs)

  try {
    await wahaFetch(
      '/api/stopTyping',
      {
        method: 'POST',
        body: JSON.stringify({ session, chatId }),
      },
      { userId }
    )
  } catch (e) {
    if (isTypingChatNotFoundError(e)) {
      console.info('[campaign] stopTyping skipped: chat not found')
    } else {
      console.warn('[campaign] stopTyping failed; continuing:', e)
    }
  }
}

async function sendTextToChatCandidates(
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
        {
          method: 'POST',
          body: JSON.stringify({ session, chatId, text }),
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

/**
 * Send campaign WhatsApp with optional typing simulation and message humanization.
 */
export async function sendCampaignWhatsAppText(
  userId: string,
  session: string,
  phone: string,
  text: string,
  opts?: CampaignWhatsAppSendOpts
): Promise<void> {
  const enableTyping = opts?.enable_typing !== false
  const randomizeSpaces = opts?.randomize_spaces !== false
  const outbound = randomizeSpaces ? humanizeWhatsAppText(text) : text
  const chatCandidates = await resolveChatCandidates(userId, session, phone)
  const typingChatId = chatCandidates[0]

  if (enableTyping && typingChatId) {
    await runTypingIndicator(userId, session, typingChatId, outbound.length)
  }

  await sendTextToChatCandidates(userId, session, chatCandidates, outbound)
}

export type CampaignWhatsAppImageSendOpts = {
  caption?: string
  enable_typing?: boolean
  mimetype?: string
  filename?: string
}

async function sendImageToChatCandidates(
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
          body: JSON.stringify({
            session,
            chatId,
            file,
            ...(caption ? { caption } : {}),
          }),
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

/** Send a rendered PNG/JPEG to WhatsApp (optional caption; typing applies to caption length). */
export async function sendCampaignWhatsAppImage(
  userId: string,
  session: string,
  phone: string,
  imageBytes: Buffer,
  opts?: CampaignWhatsAppImageSendOpts
): Promise<void> {
  const mimetype = opts?.mimetype ?? 'image/png'
  const filename = opts?.filename ?? 'image.png'
  const caption = opts?.caption?.trim() || undefined
  const enableTyping = opts?.enable_typing !== false
  const chatCandidates = await resolveChatCandidates(userId, session, phone)
  const typingChatId = chatCandidates[0]

  if (enableTyping && caption && typingChatId) {
    await runTypingIndicator(userId, session, typingChatId, caption.length)
  }

  await sendImageToChatCandidates(
    userId,
    session,
    chatCandidates,
    {
      mimetype,
      filename,
      data: imageBytes.toString('base64'),
    },
    caption
  )
}
