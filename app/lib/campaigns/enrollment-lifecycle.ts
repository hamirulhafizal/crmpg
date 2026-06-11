import { getMalaysiaTodayYmd } from '@/app/lib/customer-dob'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'

export type ExistingEnrollmentRow = {
  id: string
  customer_id: string
  status: string
  completed_at: string | null
  metadata?: Record<string, unknown> | null
  enrolled_at?: string | null
}

/** Birthday-today audiences run in parallel — one-at-a-time queue would leave late customers unsent. */
export function bypassSequentialCustomerQueueForAudience(filters: CampaignAudienceFilters): boolean {
  return Boolean(filters.dob_is_today)
}

export function malaysiaYmdFromIso(iso: string | null | undefined): string | null {
  if (!iso?.trim()) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d)
  const y = parts.find((p) => p.type === 'year')?.value
  const mo = parts.find((p) => p.type === 'month')?.value
  const day = parts.find((p) => p.type === 'day')?.value
  if (!y || !mo || !day) return null
  return `${y}-${mo}-${day}`
}

/**
 * Completed/paused enrollments block re-sync forever unless reset on a new birthday run.
 * Active rows are left alone (in progress or waiting in non-birthday flows).
 */
export function shouldReenrollBirthdayEnrollment(
  enrollment: Pick<ExistingEnrollmentRow, 'status' | 'completed_at'>,
  filters: CampaignAudienceFilters
): boolean {
  if (!filters.dob_is_today) return false
  if (enrollment.status === 'paused') return true
  if (enrollment.status !== 'completed') return false
  const completedYmd = malaysiaYmdFromIso(enrollment.completed_at)
  if (!completedYmd) return true
  return completedYmd !== getMalaysiaTodayYmd()
}
