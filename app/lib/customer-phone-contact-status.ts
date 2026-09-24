/**
 * Manual phone / WhatsApp contact status (dealer override).
 * Separate from computed account status (active / free / freeze / …).
 */

export type PhoneContactStatus = 'valid' | 'invalid' | 'changed' | 'passed_away'

export const PHONE_CONTACT_STATUSES: PhoneContactStatus[] = [
  'valid',
  'invalid',
  'changed',
  'passed_away',
]

export function parsePhoneContactStatus(raw: unknown): PhoneContactStatus {
  const v = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
  if (v === 'invalid' || v === 'changed' || v === 'passed_away' || v === 'valid') return v
  // Legacy / alternate labels
  if (v === 'changed_no' || v === 'phone_changed' || v === 'wrong_person') return 'changed'
  if (v === 'deceased' || v === 'passed' || v === 'passedaway') return 'passed_away'
  if (v === 'cant_contact' || v === 'cannot_contact' || v === 'unreachable') return 'invalid'
  // Missing column / null → treat as valid so existing customers keep messaging
  return 'valid'
}

/** True when the raw value is an explicit known status (including aliases). Empty → false. */
export function isKnownPhoneContactStatusInput(raw: unknown): boolean {
  if (raw == null) return false
  const v = String(raw).trim()
  if (!v) return false
  const normalized = v.toLowerCase().replace(/\s+/g, '_')
  return (
    normalized === 'valid' ||
    normalized === 'invalid' ||
    normalized === 'changed' ||
    normalized === 'passed_away' ||
    normalized === 'changed_no' ||
    normalized === 'phone_changed' ||
    normalized === 'wrong_person' ||
    normalized === 'deceased' ||
    normalized === 'passed' ||
    normalized === 'passedaway' ||
    normalized === 'cant_contact' ||
    normalized === 'cannot_contact' ||
    normalized === 'unreachable'
  )
}

export function getPhoneContactStatusLabel(status: PhoneContactStatus): string {
  switch (status) {
    case 'valid':
      return 'Valid'
    case 'invalid':
      return 'Invalid (can’t contact)'
    case 'changed':
      return 'Changed number (wrong person)'
    case 'passed_away':
      return 'Passed away'
    default:
      return 'Valid'
  }
}

export function getPhoneContactStatusFromRow(row: unknown): PhoneContactStatus {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return 'valid'
  return parsePhoneContactStatus((row as Record<string, unknown>).phone_contact_status)
}

/** Only `valid` numbers may receive automated WhatsApp. */
export function isWhatsAppSendAllowed(row: unknown): boolean {
  return getPhoneContactStatusFromRow(row) === 'valid'
}
