import type { SupabaseClient } from '@supabase/supabase-js'

/** Do not physically resend the same enrollment step within this window. */
export const CAMPAIGN_STEP_SEND_DEDUP_MS = 24 * 60 * 60 * 1000

export type RecentStepLogRow = {
  id: string
  send_status: 'pending' | 'sent' | 'failed' | 'skipped'
  error_message: string | null
  sent_at: string | null
  created_at: string
}

export async function findRecentStepLog(
  supabase: SupabaseClient,
  enrollmentId: string,
  stepId: string,
  windowMs: number = CAMPAIGN_STEP_SEND_DEDUP_MS
): Promise<RecentStepLogRow | null> {
  const since = new Date(Date.now() - windowMs).toISOString()
  const { data, error } = await supabase
    .from('campaign_message_logs')
    .select('id, send_status, error_message, sent_at, created_at')
    .eq('enrollment_id', enrollmentId)
    .eq('campaign_step_id', stepId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.warn('[campaign-dedup] findRecentStepLog error:', error.message)
    return null
  }

  return (data as RecentStepLogRow | null) ?? null
}

/** True when a prior attempt exists — caller must not send WhatsApp again. */
export function shouldSkipPhysicalResend(prior: RecentStepLogRow | null): boolean {
  if (!prior) return false
  return prior.send_status === 'pending' || prior.send_status === 'sent' || prior.send_status === 'failed'
}
