/**
 * GAP public lead → WhatsApp (WAHA). Configure in env (no secrets in code):
 * - WAHA_GAP_LEAD_SESSION — sender session name (e.g. 601156747399); change when you switch device/session.
 * - WAHA_GAP_LEAD_API_KEY — optional; falls back to WAHA_API_KEY.
 * - WAHA_GAP_LEAD_BASE_URL — optional; falls back to WAHA_API_BASE_URL / default host.
 * - WAHA_GAP_LEAD_CC_CHAT_ID — optional second copy (e.g. 260635845763172@lid).
 */
import { readFile } from 'fs/promises'
import path from 'path'

import { getGapLeadFormWahaConfig, wahaFetchWithConfig, type WahaConfig } from '@/app/lib/waha'

/** E.164-style MSISDN (MY) for @c.us chat id. */
function phoneToWhatsappChatId(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('0')) digits = '60' + digits.slice(1)
  else if (!digits.startsWith('60')) digits = '60' + digits
  return `${digits}@c.us`
}

function isPlausibleDealerPhone(raw: string | undefined | null): boolean {
  if (!raw || !String(raw).trim()) return false
  const digits = String(raw).replace(/\D/g, '')
  if (digits === '0123456789') return false
  return digits.length >= 9
}

function normalizeWahaText(text: string): string {
  const t = String(text ?? '')
    .replace(/\u0000/g, '')
    .trim()
  return t.length > 0 ? t : ' '
}

/**
 * Send GAP lead text to the dealer on WhatsApp (and optional CC to @lid / group).
 * Uses `WAHA_GAP_LEAD_SESSION` (sender session) and `WAHA_GAP_LEAD_API_KEY` or `WAHA_API_KEY`.
 */
export async function sendGapLeadWhatsAppMessages(opts: {
  dealerPhone: string | undefined | null
  text: string
}): Promise<{ sentToDealer: boolean; sentCc: boolean; skipReason?: string }> {
  const session = process.env.WAHA_GAP_LEAD_SESSION?.trim()
  const cfg = getGapLeadFormWahaConfig()

  if (!cfg || !session) {
    return {
      sentToDealer: false,
      sentCc: false,
      skipReason: 'WAHA_GAP_LEAD_SESSION or WAHA_GAP_LEAD_API_KEY / WAHA_API_KEY not set',
    }
  }

  const messageText = normalizeWahaText(opts.text)

  let sentToDealer = false
  let sentCc = false

  if (isPlausibleDealerPhone(opts.dealerPhone)) {
    const chatId = phoneToWhatsappChatId(opts.dealerPhone!)
    await sendText(cfg, session, chatId, messageText)
    sentToDealer = true
  }

  const ccChatId = process.env.WAHA_GAP_LEAD_CC_CHAT_ID?.trim()
  let ccFailed = false
  if (ccChatId) {
    try {
      await sendText(cfg, session, ccChatId, messageText)
      sentCc = true
    } catch (e: unknown) {
      ccFailed = true
      // WAHA occasionally 500s on @lid / CC with internal msgChunks errors; dealer send may still succeed.
      console.warn(
        'WAHA sendText to CC failed:',
        e instanceof Error ? e.message : e
      )
    }
  }

  if (!sentToDealer && !sentCc) {
    return {
      sentToDealer: false,
      sentCc: false,
      skipReason: ccFailed
        ? 'WAHA CC send failed (check session / WAHA_GAP_LEAD_CC_CHAT_ID).'
        : 'No dealer phone and no WAHA_GAP_LEAD_CC_CHAT_ID',
    }
  }

  return { sentToDealer, sentCc }
}

/**
 * Send one image (e.g. Playwright screenshot) to the dealer WhatsApp and optional CC,
 * using the same session/API as {@link sendGapLeadWhatsAppMessages}.
 * Uses `POST /api/sendImage` with base64 file payload.
 */
export async function sendGapLeadWhatsAppImage(opts: {
  dealerPhone: string | undefined | null
  /** Absolute path, or relative to `process.cwd()` */
  imagePath: string
  caption?: string
}): Promise<{ sentToDealer: boolean; sentCc: boolean; skipReason?: string }> {
  const session = process.env.WAHA_GAP_LEAD_SESSION?.trim()
  const cfg = getGapLeadFormWahaConfig()

  if (!cfg || !session) {
    return {
      sentToDealer: false,
      sentCc: false,
      skipReason: 'WAHA_GAP_LEAD_SESSION or WAHA_GAP_LEAD_API_KEY / WAHA_API_KEY not set',
    }
  }

  const resolvedPath = path.isAbsolute(opts.imagePath)
    ? opts.imagePath
    : path.join(process.cwd(), opts.imagePath)
  const buf = await readFile(resolvedPath)
  const data = buf.toString('base64')
  const ext = path.extname(resolvedPath).toLowerCase()
  const mimetype =
    ext === '.jpg' || ext === '.jpeg'
      ? 'image/jpeg'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/png'
  const filename = path.basename(resolvedPath) || 'screenshot.png'

  let sentToDealer = false
  let sentCc = false

  if (isPlausibleDealerPhone(opts.dealerPhone)) {
    const chatId = phoneToWhatsappChatId(opts.dealerPhone!)
    await sendImage(cfg, session, chatId, { mimetype, filename, data }, opts.caption)
    sentToDealer = true
  }

  const ccChatId = process.env.WAHA_GAP_LEAD_CC_CHAT_ID?.trim()
  if (ccChatId) {
    await sendImage(cfg, session, ccChatId, { mimetype, filename, data }, opts.caption)
    sentCc = true
  }

  if (!sentToDealer && !sentCc) {
    return {
      sentToDealer: false,
      sentCc: false,
      skipReason: 'No dealer phone and no WAHA_GAP_LEAD_CC_CHAT_ID',
    }
  }

  return { sentToDealer, sentCc }
}

async function sendText(cfg: WahaConfig, session: string, chatId: string, text: string) {
  await wahaFetchWithConfig(cfg, '/api/sendText', {
    method: 'POST',
    body: JSON.stringify({
      session,
      chatId,
      text: normalizeWahaText(text),
    }),
  })
}

async function sendImage(
  cfg: WahaConfig,
  session: string,
  chatId: string,
  file: { mimetype: string; filename: string; data: string },
  caption?: string
) {
  await wahaFetchWithConfig(cfg, '/api/sendImage', {
    method: 'POST',
    body: JSON.stringify({
      session,
      chatId,
      file,
      ...(caption ? { caption } : {}),
    }),
  })
}
