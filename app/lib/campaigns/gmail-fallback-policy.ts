import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'

/** Recipient/chat issues where Gmail fallback (if enabled) may still be appropriate. */
export function isRecipientLevelWhatsAppError(error: unknown): boolean {
  const m = (
    error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  ).toLowerCase()
  if (!m) return false
  return (
    m.includes('chat not found') ||
    m.includes('chat_not_found') ||
    m.includes('unknown chat') ||
    m.includes('no lid for user') ||
    m.includes('no lid') ||
    m.includes('invalid whatsapp number') ||
    m.includes('not registered on whatsapp') ||
    m.includes('not a whatsapp user') ||
    m.includes('phone number is not registered')
  )
}

/**
 * True when WhatsApp failed because the dealer session or provider is down — not a per-customer issue.
 * Gmail fallback must NOT run in these cases.
 */
export function isWhatsAppConnectionOrSessionError(error: unknown): boolean {
  if (isRecipientLevelWhatsAppError(error)) return false

  if (error instanceof WhatsAppApiError) {
    const m = error.message.toLowerCase()
    if ([401, 403, 408, 502, 503, 504, 524].includes(error.status)) return true
    if (error.status >= 500) return true
    if (
      m.includes('api key') ||
      m.includes('reconnect') ||
      m.includes('session missing') ||
      m.includes('session not found') ||
      m.includes('not connected') ||
      m.includes('disconnected')
    ) {
      return true
    }
    if (error.status === 404) return true
  }

  if (error instanceof Error) {
    const m = error.message.toLowerCase()
    return (
      m.includes('timeout') ||
      m.includes('timed out') ||
      m.includes('aborted') ||
      m.includes('fetch failed') ||
      m.includes('econnrefused') ||
      m.includes('enotfound') ||
      m.includes('network') ||
      m.includes('gateway timeout') ||
      m.includes('service unreachable') ||
      m.includes('session not connected') ||
      m.includes('not connected') ||
      m.includes('disconnected') ||
      m.includes('api key missing') ||
      m.includes('reconnect') ||
      m.includes('waha request timed out') ||
      m.includes('wasender request timed out') ||
      m.includes('waha ') ||
      m.includes('wasender ')
    )
  }

  return true
}

/**
 * Gmail fallback is opt-in for step 1 only when WhatsApp clearly failed for this customer,
 * not when the dealer connection/provider is down or the error is unknown.
 */
export function shouldUseGmailFallbackAfterWhatsAppError(error: unknown): boolean {
  if (isWhatsAppConnectionOrSessionError(error)) return false
  return isRecipientLevelWhatsAppError(error)
}
