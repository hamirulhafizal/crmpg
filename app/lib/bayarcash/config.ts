/**
 * Server-only Bayarcash configuration.
 * Use BAYARCASH_API_BASE if set; otherwise pick host from BAYARCASH_SANDBOX.
 */
export function getBayarcashApiBase(): string {
  const fromEnv = (process.env.BAYARCASH_API_BASE || '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  return process.env.BAYARCASH_SANDBOX === 'true'
    ? 'https://api.console.bayarcash-sandbox.com/v3'
    : 'https://api.console.bayar.cash/v3'
}

export function getBayarcashPat(): string | null {
  const t = (process.env.BAYARCASH_PAT || '').trim()
  return t || null
}

export function getBayarcashPortalKey(): string | null {
  const t = (process.env.BAYARCASH_PORTAL_KEY || '').trim()
  return t || null
}

export function getBayarcashSecret(): string | null {
  const t = (process.env.BAYARCASH_SECRET || '').trim()
  return t || null
}

/**
 * Payment channel for one-time `POST /payment-intents`.
 * Portal channels: 1 = FPX, 3 = Direct Debit (e-Mandate only — not valid for payment-intents).
 * Always use FPX (1) for one-time checkout; Direct Debit uses `/mandates` instead.
 */
export function getBayarcashPaymentChannel(): number {
  const raw = (process.env.BAYARCASH_PAYMENT_CHANNEL || '1').trim()
  const n = parseInt(raw, 10)
  if (!Number.isFinite(n) || n <= 0) return 1
  // Channel 3 is FpxDirectDebit — Bayarcash rejects it on payment-intents ("payment_channel.0 is invalid")
  if (n === 3) return 1
  return n
}

export function isGoogleAdsBayarcashRenewalEnabled(): boolean {
  return process.env.CRM_BAYARCASH_RENEWAL === 'true'
}

/** Feature flag for Google Ads e-Mandate / Direct Debit enrollment. */
export function isGoogleAdsBayarcashDirectDebitEnabled(): boolean {
  return process.env.CRM_BAYARCASH_DIRECT_DEBIT === 'true'
}

/** PAT + portal key present — safe to expose boolean to UI (no secrets). */
export function isBayarcashConfiguredForCheckout(): boolean {
  return !!(getBayarcashPat() && getBayarcashPortalKey())
}

/** Checkout + secret (checksum) ready for Direct Debit enrollment. */
export function isBayarcashConfiguredForDirectDebit(): boolean {
  return isBayarcashConfiguredForCheckout() && !!getBayarcashSecret()
}

/** @deprecated Prefer `myrToBayarcashPaymentIntentAmount` for POST /payment-intents. */
export function myrToAmountInteger(myr: number): number {
  return Math.max(0, Math.round(Number(myr) * 100))
}

/**
 * Bayarcash `POST /v3/payment-intents` expects integer `amount`.
 * Whole ringgit (e.g. RM 99) must be sent as **99**, not **9900** (sen), or the FPX page shows RM 9,900.
 * Fractional ringgit still uses **sen** (e.g. RM 99.50 → 9950).
 */
export function myrToBayarcashPaymentIntentAmount(myr: number): number {
  const rm = Number(myr)
  if (!Number.isFinite(rm) || rm <= 0) return 0
  const cents = Math.round(rm * 100 + Number.EPSILON)
  if (cents % 100 === 0 && rm >= 1) return Math.round(cents / 100)
  return cents
}
