import type { SupabaseClient } from '@supabase/supabase-js'
import {
  isCurrentlyInPaidPeriod,
  loadActiveGoogleAdsDealers,
} from '@/app/lib/google-ads/active-dealers-for-leads'

export async function clearRotationQueueOverrides(
  admin: SupabaseClient,
  participantIds: string[]
): Promise<void> {
  if (participantIds.length === 0) return

  const { error } = await admin
    .from('google_ads_participants')
    .update({
      rotation_queue_order: null,
      rotation_queue_updated_at: null,
      rotation_queue_updated_by: null,
    })
    .in('id', participantIds)

  if (error) throw new Error(error.message)
}

/** Apply admin-defined order for waiting participants; completed stay ahead in current order. */
export async function applyWaitingQueueOrder(
  admin: SupabaseClient,
  waitingParticipantIds: string[],
  adminUserId: string
): Promise<{ updated: number }> {
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  if (dealers.length === 0) throw new Error('No active participants in rotation')

  const completed = dealers.filter((d) => d.lead_email)
  const waiting = dealers.filter((d) => !d.lead_email)
  const waitingSet = new Set(waiting.map((d) => d.participant_id))
  const uniqueIds = [...new Set(waitingParticipantIds)]

  if (uniqueIds.length !== waiting.length) {
    throw new Error('Waiting participant list must include every waiting participant exactly once')
  }

  for (const id of uniqueIds) {
    if (!waitingSet.has(id)) {
      throw new Error('Participant is not in the waiting queue')
    }
  }

  const fullOrder = [
    ...completed.map((d) => d.participant_id),
    ...uniqueIds,
  ]
  const now = new Date().toISOString()

  await Promise.all(
    fullOrder.map((participantId, index) =>
      admin
        .from('google_ads_participants')
        .update({
          rotation_queue_order: index + 1,
          rotation_queue_updated_at: now,
          rotation_queue_updated_by: adminUserId,
        })
        .eq('id', participantId)
        .then(({ error }) => {
          if (error) throw new Error(error.message)
        })
    )
  )

  return { updated: fullOrder.length }
}

export async function resetRotationQueueToPaymentOrder(
  admin: SupabaseClient,
  adminUserId: string
): Promise<{ cleared: number }> {
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  const ids = dealers.map((d) => d.participant_id)
  if (ids.length === 0) return { cleared: 0 }

  const { error } = await admin
    .from('google_ads_participants')
    .update({
      rotation_queue_order: null,
      rotation_queue_updated_at: new Date().toISOString(),
      rotation_queue_updated_by: adminUserId,
    })
    .in('id', ids)

  if (error) throw new Error(error.message)
  return { cleared: ids.length }
}

export async function setParticipantLeadEmail(
  admin: SupabaseClient,
  participantId: string,
  leadEmail: boolean
): Promise<void> {
  const { dealers } = await loadActiveGoogleAdsDealers(admin)
  const active = dealers.find((d) => d.participant_id === participantId)
  if (!active) {
    throw new Error('Participant is not in the active rotation pool')
  }

  const { error } = await admin
    .from('google_ads_participants')
    .update({ lead_email: leadEmail })
    .eq('id', participantId)

  if (error) throw new Error(error.message)
}

export async function activePoolHasManualQueueOrder(admin: SupabaseClient): Promise<boolean> {
  const { data, error } = await admin
    .from('google_ads_participants')
    .select('id, rotation_queue_order, google_ads_subscriptions(status, current_period_start, current_period_end)')
    .not('rotation_queue_order', 'is', null)
    .limit(50)

  if (error) throw new Error(error.message)
  if (!data?.length) return false

  return data.some((row) => {
    const subRaw = row.google_ads_subscriptions
    const sub = Array.isArray(subRaw) ? subRaw[0] : subRaw
    if (!sub) return false
    return isCurrentlyInPaidPeriod(sub.status, sub.current_period_start, sub.current_period_end)
  })
}
