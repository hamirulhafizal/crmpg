export type BillingPeriod = 'monthly' | 'yearly'

/** Next period end from a period start and billing cadence. */
export function addBillingPeriod(start: Date, period: BillingPeriod): Date {
  const d = new Date(start.getTime())
  if (period === 'monthly') {
    d.setMonth(d.getMonth() + 1)
  } else {
    d.setFullYear(d.getFullYear() + 1)
  }
  return d
}

export type SubscriptionShape = {
  status: string
  current_period_start: string | null
  current_period_end: string | null
}

/** True when subscription covers "now" (active window). */
export function isPeriodCurrentlyActive(sub: SubscriptionShape): boolean {
  if (!sub.current_period_start || !sub.current_period_end) return false
  const now = Date.now()
  const start = new Date(sub.current_period_start).getTime()
  const end = new Date(sub.current_period_end).getTime()
  return now >= start && now <= end && sub.status === 'active'
}

/** Outside paid window or pending payment — user may complete renewal flow. */
export function canRequestRenewal(sub: SubscriptionShape): boolean {
  if (sub.status === 'cancelled') return false
  if (sub.status === 'pending_payment') return true
  if (!sub.current_period_end) return true

  const end = new Date(sub.current_period_end)
  const now = new Date()
  if (now > end) return true

  if (sub.status === 'active') {
    const ms = end.getTime() - now.getTime()
    const days = ms / (86400 * 1000)
    return days <= 7
  }

  return false
}

/** Display label for ops / participants. */
export function effectivePackageStatus(sub: SubscriptionShape): 'active' | 'inactive' {
  if (sub.status !== 'active') return 'inactive'
  return isPeriodCurrentlyActive(sub) ? 'active' : 'inactive'
}
