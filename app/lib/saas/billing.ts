import type { SaasBillingPeriod, SaasSubscriptionStatus } from '@/app/lib/saas/types'

export function addSaasBillingPeriod(start: Date, period: SaasBillingPeriod): Date {
  const end = new Date(start.getTime())
  if (period === 'yearly') {
    end.setFullYear(end.getFullYear() + 1)
    return end
  }
  // monthly default
  end.setMonth(end.getMonth() + 1)
  return end
}

export function isProSubscriptionActive(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (opts.planSlug !== 'pro') return false
  if (opts.status === 'expired' || opts.status === 'cancelled') return false
  if (opts.status === 'trialing') {
    if (!opts.trialEndsAt) return true
    return new Date(opts.trialEndsAt) > now
  }
  if (opts.status === 'active') {
    if (!opts.currentPeriodEnd) return true
    return new Date(opts.currentPeriodEnd) > now
  }
  return false
}

/** Pro with confirmed paid subscription (not opt-in trial). */
export function isProPaidActive(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  currentPeriodEnd: string | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (opts.planSlug !== 'pro') return false
  if (opts.status !== 'active') return false
  if (!opts.currentPeriodEnd) return true
  return new Date(opts.currentPeriodEnd) > now
}

/** Pro opt-in trial (before first payment). */
export function isProTrialActive(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (opts.planSlug !== 'pro') return false
  if (opts.status !== 'trialing') return false
  if (!opts.trialEndsAt) return true
  return new Date(opts.trialEndsAt) > now
}

/** Free plan signup trial (distinct from opt-in Pro trial). */
export function isFreeTrialActive(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (opts.planSlug !== 'free') return false
  if (opts.status !== 'trialing') return false
  if (!opts.trialEndsAt) return false
  return new Date(opts.trialEndsAt) > now
}

/** Full CRM write access: Pro active or Free trial in progress. */
export function hasPlatformWriteAccess(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  now?: Date
}): boolean {
  if (isProSubscriptionActive(opts)) return true
  return isFreeTrialActive(opts)
}

export function isTrialUpgradeCheckout(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
}): boolean {
  return opts.planSlug === 'pro' && opts.status === 'trialing'
}

export function canCheckoutPro(opts: {
  planSlug: string
  status: SaasSubscriptionStatus
  trialEndsAt: string | null
  currentPeriodEnd: string | null
  now?: Date
}): boolean {
  const now = opts.now ?? new Date()
  if (opts.planSlug === 'free') return true
  if (opts.planSlug !== 'pro') return true
  if (opts.status === 'expired' || opts.status === 'cancelled') return true
  // Allow upgrading to paid monthly at any time during Pro trial
  if (opts.status === 'trialing') return true
  if (opts.status === 'active' && opts.currentPeriodEnd) {
    const end = new Date(opts.currentPeriodEnd)
    const renewWindowMs = 7 * 24 * 60 * 60 * 1000
    return end.getTime() - now.getTime() <= renewWindowMs
  }
  return false
}

export function checkoutPriceAmount(opts: {
  planListPrice: number
  lockedPrice: number
  planSlug: string
  isRenewal: boolean
}): number {
  if (opts.planSlug === 'free') return 0
  if (opts.isRenewal && opts.lockedPrice > 0) return opts.lockedPrice
  return opts.planListPrice
}
