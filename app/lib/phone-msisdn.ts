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
