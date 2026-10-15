/** Which Bayarcash channels a SaaS plan allows (admin plan setting). */
export type SaasPlanAllowedPaymentMethods = 'both' | 'one_off' | 'auto_debit'

export const SAAS_PLAN_ALLOWED_PAYMENT_METHODS: SaasPlanAllowedPaymentMethods[] = [
  'both',
  'one_off',
  'auto_debit',
]

export const SAAS_PLAN_ALLOWED_PAYMENT_METHOD_LABELS: Record<
  SaasPlanAllowedPaymentMethods,
  string
> = {
  both: 'Both (FPX + auto debit)',
  one_off: 'One-off FPX only',
  auto_debit: 'Auto debit only',
}

export function parseSaasPlanAllowedPaymentMethods(
  marketingDetails: unknown
): SaasPlanAllowedPaymentMethods {
  const meta =
    marketingDetails && typeof marketingDetails === 'object' && !Array.isArray(marketingDetails)
      ? (marketingDetails as Record<string, unknown>)
      : null
  const raw = String(meta?.allowed_payment_methods ?? meta?.payment_methods ?? '')
    .trim()
    .toLowerCase()
  if (raw === 'one_off' || raw === 'fpx' || raw === 'fpx_only' || raw === 'one-off') {
    return 'one_off'
  }
  if (
    raw === 'auto_debit' ||
    raw === 'direct_debit' ||
    raw === 'direct_debit_only' ||
    raw === 'auto-debit'
  ) {
    return 'auto_debit'
  }
  return 'both'
}

export function planAllowsOneOffPayment(allowed: SaasPlanAllowedPaymentMethods): boolean {
  return allowed === 'both' || allowed === 'one_off'
}

export function planAllowsAutoDebitPayment(allowed: SaasPlanAllowedPaymentMethods): boolean {
  return allowed === 'both' || allowed === 'auto_debit'
}

export type SaasPaymentMethodStatus =
  | 'none'
  | 'fpx'
  | 'direct_debit_pending'
  | 'direct_debit_active'
  | 'direct_debit_failed'

export const SAAS_PAYMENT_METHOD_STATUSES: SaasPaymentMethodStatus[] = [
  'none',
  'fpx',
  'direct_debit_pending',
  'direct_debit_active',
  'direct_debit_failed',
]

export const SAAS_PAYMENT_METHOD_LABELS: Record<SaasPaymentMethodStatus, string> = {
  none: 'None',
  fpx: 'FPX',
  direct_debit_pending: 'Auto debit · Pending',
  direct_debit_active: 'Auto debit · Active',
  direct_debit_failed: 'Auto debit · Failed',
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

function bayarcashMandateLooksActive(meta: Record<string, unknown>): boolean {
  const nested = asMeta(meta.bayarcash_mandate)
  const desc = String(nested.status_description || nested.status || '')
    .trim()
    .toLowerCase()
  if (desc === 'active' || desc === 'approved' || desc.includes('active') || desc.includes('approved')) {
    return true
  }
  const numeric = Number(nested.status)
  // Bayarcash FpxDirectDebit: ACTIVE=3, APPROVED=5
  if (numeric === 3 || numeric === 5) return true
  if (meta.payment_confirmed_at && meta.bayarcash_mandate_order) return true
  return false
}

/**
 * Derive how the dealer pays / is trying to pay.
 * Mandate row wins when present; otherwise fall back to payment_metadata
 * (including nested Bayarcash mandate Active/Approved — not always "Pending").
 */
export function deriveSaasPaymentMethodStatus(args: {
  paymentMetadata?: unknown
  paymentProvider?: string | null
  mandateStatus?: string | null
}): SaasPaymentMethodStatus {
  const mandate = String(args.mandateStatus || '')
    .trim()
    .toLowerCase()

  if (mandate === 'active') return 'direct_debit_active'
  if (
    mandate === 'failed' ||
    mandate === 'cancelled' ||
    mandate === 'canceled' ||
    mandate === 'terminated' ||
    mandate === 'rejected'
  ) {
    return 'direct_debit_failed'
  }
  if (
    mandate === 'pending_enrollment' ||
    mandate === 'pending' ||
    mandate === 'waiting_approval' ||
    mandate === 'submitted'
  ) {
    return 'direct_debit_pending'
  }

  const meta = asMeta(args.paymentMetadata)
  const method = String(meta.payment_method || '')
    .trim()
    .toLowerCase()

  if (method === 'direct_debit') {
    return bayarcashMandateLooksActive(meta) ? 'direct_debit_active' : 'direct_debit_pending'
  }
  if (method === 'fpx') return 'fpx'

  if (meta.bayarcash_mandate && bayarcashMandateLooksActive(meta)) {
    return 'direct_debit_active'
  }

  if (meta.bayarcash_payment_intent && typeof meta.bayarcash_payment_intent === 'object') {
    return 'fpx'
  }
  if (meta.payment_confirmed_at || meta.bayarcash_order_number) {
    return 'fpx'
  }
  if (String(args.paymentProvider || '').toLowerCase() === 'bayarcash' && method) {
    return method === 'direct_debit'
      ? bayarcashMandateLooksActive(meta)
        ? 'direct_debit_active'
        : 'direct_debit_pending'
      : 'fpx'
  }

  return 'none'
}
