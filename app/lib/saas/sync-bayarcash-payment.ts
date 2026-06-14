import type { SupabaseClient } from '@supabase/supabase-js'

import { getPaymentIntentById } from '@/app/lib/bayarcash/payment-intent'
import { activateSaasSubscriptionAfterPayment } from '@/app/lib/saas/activate-subscription-after-payment'

export async function syncSaasPaymentByOrderNumber(
  admin: SupabaseClient,
  orderNumber: string
): Promise<
  | { status: 'paid' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'error'; message: string }
> {
  const { data: pay, error } = await admin
    .from('saas_payments')
    .select('id, user_id, plan_id, payment_intent_id, status, order_number, amount, currency')
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

    const act = await activateSaasSubscriptionAfterPayment(admin, {
      userId: pay.user_id,
      planId: pay.plan_id,
      amountPaid: Number(pay.amount),
      currency: String(pay.currency || 'MYR'),
      externalPaymentId: pi.data.id,
      paymentMetadataExtra: {
        bayarcash_order_number: orderNumber,
        bayarcash_payment_intent: pi.data,
        last_sync_at: new Date().toISOString(),
      },
    })
    if (!act.ok) return { status: 'error', message: act.error }

    const { error: u1 } = await admin
      .from('saas_payments')
      .update({
        status: 'paid',
        bayarcash_transaction_id: txId,
        exchange_reference_number: ref,
        receipt_label: receipt,
        metadata: { payment_intent_status: pi.data },
      })
      .eq('id', pay.id)

    if (u1) return { status: 'error', message: u1.message }
    return { status: 'paid' }
  }

  if (st === 'failed' || st === 'cancelled' || st === 'canceled') {
    await admin
      .from('saas_payments')
      .update({ status: st === 'failed' ? 'failed' : 'cancelled', metadata: { last_status: pi.data } })
      .eq('id', pay.id)
    return { status: 'failed' }
  }

  return { status: 'pending' }
}
