import { createHmac } from 'crypto'

/**
 * Bayarcash checksum: sort field keys alphabetically, join values with `|`, HMAC-SHA256 hex.
 * @see bayarcash-rs / bayarcash npm SDKs
 */
export function bayarcashHmacChecksum(
  secretKey: string,
  fields: Record<string, string | number>
): string {
  const keys = Object.keys(fields).sort()
  const payload = keys.map((k) => String(fields[k] ?? '')).join('|')
  return createHmac('sha256', secretKey).update(payload).digest('hex')
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
    payer_id_type: data.payer_id_type,
    payer_name: data.payer_name,
    payer_telephone_number: data.payer_telephone_number,
  })
}
