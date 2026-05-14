import { wahaFetch, WahaApiError } from '@/app/lib/waha'

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

export async function sendCampaignWhatsAppText(
  userId: string,
  session: string,
  phone: string,
  text: string
): Promise<void> {
  const digits = normalisePhoneToMsisdn(phone)
  const lidChatId = await resolveWahaLidChatId(userId, session, digits)
  const chatCandidates = Array.from(
    new Set([...(lidChatId ? [lidChatId] : []), `${digits}@c.us`, `${digits}@s.whatsapp.net`])
  )

  let lastErr: unknown = null
  for (const chatId of chatCandidates) {
    try {
      await wahaFetch(
        '/api/sendText',
        {
          method: 'POST',
          body: JSON.stringify({
            session,
            chatId,
            text,
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
