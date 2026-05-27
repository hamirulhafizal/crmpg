import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'

/** Digits-only MSISDN variants used for matching stored customer phones. */
export function phoneLookupVariants(raw: string): string[] {
  const msisdn = normalizePhoneToMsisdn(raw)
  const variants = new Set<string>()
  variants.add(msisdn)
  if (msisdn.startsWith('60') && msisdn.length > 2) {
    variants.add(`0${msisdn.slice(2)}`)
    variants.add(msisdn.slice(2))
  }
  return [...variants]
}

export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '')
}

export function phonesMatch(stored: string | null | undefined, input: string): boolean {
  if (!stored?.trim()) return false
  const a = digitsOnly(stored)
  const b = digitsOnly(input)
  if (!a || !b) return false
  if (a === b) return true
  const na = normalizePhoneToMsisdn(stored)
  const nb = normalizePhoneToMsisdn(input)
  if (na === nb) return true
  const minLen = 9
  if (na.length >= minLen && nb.length >= minLen) {
    return na.slice(-minLen) === nb.slice(-minLen)
  }
  return false
}
