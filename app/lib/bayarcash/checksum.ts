import { createHmac } from 'crypto'

/**
 * Bayarcash checksum: sort field keys alphabetically, join values with `|`, HMAC-SHA256 hex.
 * Matches official PHP / Ruby / Rust SDKs (`createFpxDirectDebitEnrolmentChecksumValue`).
 */
export function bayarcashHmacChecksum(
  secretKey: string,
  fields: Record<string, string | number>
): string {
  const keys = Object.keys(fields).sort()
  const payload = keys.map((k) => String(fields[k] ?? '')).join('|')
  return createHmac('sha256', secretKey).update(payload, 'utf8').digest('hex')
}

/**
 * Strip characters that break Bayarcash's `|`-joined checksum recipe or get
 * normalised away on their gateway before verification (e.g. `|` in display names).
 */
export function sanitizeBayarcashText(value: string, maxLen: number): string {
  return value
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[|]+/g, ' ')
    .replace(/[—–−]/g, '-') // em/en dashes → ASCII hyphen
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen)
}

/** Checksum for FPX Direct Debit e-Mandate enrollment. */
export function createFpxDirectDebitEnrolmentChecksum(
  secretKey: string,
  data: {
    order_number: string
    amount: string | number
    payer_name: string
    payer_email: string
    payer_telephone_number: string | number
    payer_id_type: string | number
    payer_id: string
    application_reason: string
    frequency_mode: string
  }
): string {
  return bayarcashHmacChecksum(secretKey, {
    amount: data.amount,
    application_reason: data.application_reason,
    frequency_mode: data.frequency_mode,
    order_number: data.order_number,
    payer_email: data.payer_email,
    payer_id: data.payer_id,
    // Always string — matches PHP implode((string)$payer_id_type)
    payer_id_type: String(data.payer_id_type),
    payer_name: data.payer_name,
    payer_telephone_number: data.payer_telephone_number,
  })
}
