/**
 * GAP public lead → WhatsApp (WAHA). Configure in env (no secrets in code):
 * - WAHA_GAP_LEAD_SESSION — sender session name (e.g. 601156747399); change when you switch device/session.
 * - WAHA_GAP_LEAD_API_KEY — optional; falls back to WAHA_API_KEY.
 * - WAHA_GAP_LEAD_BASE_URL — optional; falls back to WAHA_API_BASE_URL / default host.
 * - WAHA_GAP_LEAD_CC_CHAT_ID — optional second copy (e.g. 260635845763172@lid).
 */
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

  let sentToDealer = false
  let sentCc = false

  if (isPlausibleDealerPhone(opts.dealerPhone)) {
    const chatId = phoneToWhatsappChatId(opts.dealerPhone!)
    await sendText(cfg, session, chatId, opts.text)
    sentToDealer = true
  }

  const ccChatId = process.env.WAHA_GAP_LEAD_CC_CHAT_ID?.trim()
  if (ccChatId) {
    await sendText(cfg, session, ccChatId, opts.text)
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
    body: JSON.stringify({ session, chatId, text }),
  })
}
