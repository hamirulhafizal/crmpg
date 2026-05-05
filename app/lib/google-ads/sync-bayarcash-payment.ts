import type { SupabaseClient } from '@supabase/supabase-js'

import { getPaymentIntentById } from '@/app/lib/bayarcash/payment-intent'
import { activateGoogleAdsSubscriptionAfterPayment } from '@/app/lib/google-ads/activate-subscription-after-payment'

/**
 * Polls Bayarcash for payment intent status; on `paid`, completes subscription + local payment row.
 */
export async function syncGoogleAdsPaymentByOrderNumber(
  admin: SupabaseClient,
  orderNumber: string
): Promise<
  | { status: 'paid' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'error'; message: string }
> {
  const { data: pay, error } = await admin
    .from('google_ads_payments')
    .select('id, participant_id, payment_intent_id, status, order_number')
    .eq('order_number', orderNumber)
    .maybeSingle()

  if (error) return { status: 'error', message: error.message }
  if (!pay) return { status: 'error', message: 'Payment not found' }
  if (pay.status === 'paid') return { status: 'paid' }
  if (!pay.payment_intent_id) return { status: 'pending' }

  const pi = await getPaymentIntentById(pay.payment_intent_id)
  if (!pi.ok) return { status: 'error', message: pi.error }

  const st = (pi.data.status || '').toLowerCase()
  if (st === 'paid') {
    const attempts = Array.isArray(pi.data.attempts) ? pi.data.attempts : []
    const lastAttempt = attempts.at(-1) ?? null
    const ref = lastAttempt?.exchange_reference_number || null
    const txId = lastAttempt?.transaction_id || null
    const receipt =
      [ref, txId].filter(Boolean).join(' · ') || `Payment intent ${pi.data.id}`

    const act = await activateGoogleAdsSubscriptionAfterPayment(admin, pay.participant_id, {
      externalPaymentId: pi.data.id,
      paymentMetadataExtra: {
        bayarcash_order_number: orderNumber,
        bayarcash_payment_intent: pi.data,
        last_sync_at: new Date().toISOString(),
      },
    })
    if (!act.ok) return { status: 'error', message: act.error }

    const { error: u1 } = await admin
      .from('google_ads_payments')
      .update({
        status: 'paid',
        bayarcash_transaction_id: txId,
        exchange_reference_number: ref,
        receipt_label: receipt,
        metadata: {
          payment_intent_status: pi.data,
        },
      })
      .eq('id', pay.id)

    if (u1) return { status: 'error', message: u1.message }
    return { status: 'paid' }
  }

  if (st === 'failed' || st === 'cancelled' || st === 'canceled') {
    await admin
      .from('google_ads_payments')
      .update({ status: st === 'failed' ? 'failed' : 'cancelled', metadata: { last_status: pi.data } })
      .eq('id', pay.id)
    return { status: 'failed' }
  }

  return { status: 'pending' }
}
