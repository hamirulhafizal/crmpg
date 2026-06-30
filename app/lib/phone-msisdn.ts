export const INVALID_CAMPAIGN_PHONE_MESSAGE = 'Invalid phone number — cannot send WhatsApp'

export function extractPhoneDigits(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/[^0-9]/g, '')
}

/** True when CRM phone can be used for WhatsApp (rejects empty, "-", country names like "Malaysia", etc.). */
export function isValidCampaignPhone(phone: string | null | undefined): boolean {
  const trimmed = String(phone ?? '').trim()
  if (!trimmed || trimmed === '-') return false
  const rawDigits = extractPhoneDigits(trimmed)
  if (rawDigits.length < 7) return false
  const msisdn = normalizePhoneToMsisdn(trimmed)
  if (!msisdn.startsWith('60')) return false
  const subscriber = msisdn.slice(2)
  return subscriber.length >= 8 && subscriber.length <= 11
}

/** Normalize phone digits to Malaysia MSISDN (leading 60). */
export function normalizePhoneToMsisdn(phone: string): string {
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

/** E.164-style display, e.g. local `184644305` → `+60184644305`. */
export function formatPhoneForDisplay(value: unknown): string {
  if (value == null) return ''
  const raw = String(value).trim()
  const digits = raw.replace(/[^0-9]/g, '')
  if (!digits) return raw
  return `+${normalizePhoneToMsisdn(raw)}`
}
