import type { SupabaseClient } from '@supabase/supabase-js'

import {
  getPaymentIntentById,
  type PaymentIntentStatusResponse,
} from '@/app/lib/bayarcash/payment-intent'
import { activateSaasSubscriptionAfterPayment } from '@/app/lib/saas/activate-subscription-after-payment'

function isBayarcashPaymentIntentPaid(pi: PaymentIntentStatusResponse): boolean {
  const st = (pi.status || '').toLowerCase()
  if (st === 'paid' || st === 'success' || st === 'successful') return true
  if (pi.paid_at) return true

  const attempts = Array.isArray(pi.attempts) ? pi.attempts : []
  const lastAttempt = attempts.at(-1)
  if (lastAttempt?.status === 3) return true
  if ((lastAttempt?.status_description || '').toLowerCase() === 'approved') return true

  return false
}

async function markSaasPaymentPaid(
  admin: SupabaseClient,
  pay: {
    id: string
    user_id: string
    plan_id: string
    order_number: string
    amount: number | string
    currency: string | null
  },
  pi: PaymentIntentStatusResponse
): Promise<{ status: 'paid' } | { status: 'error'; message: string }> {
  const attempts = Array.isArray(pi.attempts) ? pi.attempts : []
  const lastAttempt = attempts.at(-1) ?? null
  const ref = lastAttempt?.exchange_reference_number || null
  const txId = lastAttempt?.transaction_id || null
  const receipt = [ref, txId].filter(Boolean).join(' · ') || `Payment intent ${pi.id}`

  const act = await activateSaasSubscriptionAfterPayment(admin, {
    userId: pay.user_id,
    planId: pay.plan_id,
    amountPaid: Number(pay.amount),
    currency: String(pay.currency || 'MYR'),
    externalPaymentId: pi.id,
    paymentMetadataExtra: {
      bayarcash_order_number: pay.order_number,
      bayarcash_payment_intent: pi,
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
      metadata: { payment_intent_status: pi },
    })
    .eq('id', pay.id)

  if (u1) return { status: 'error', message: u1.message }
  return { status: 'paid' }
}

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
  if (isBayarcashPaymentIntentPaid(pi.data)) {
    return markSaasPaymentPaid(admin, pay, pi.data)
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

export async function syncSaasPaymentByPaymentIntentId(
  admin: SupabaseClient,
  paymentIntentId: string
): Promise<
  | { status: 'paid' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'error'; message: string }
> {
  const id = paymentIntentId.trim()
  if (!id) return { status: 'error', message: 'payment_intent_id is required' }

  const { data: pay, error } = await admin
    .from('saas_payments')
    .select('order_number')
    .eq('payment_intent_id', id)
    .maybeSingle()

  if (error) return { status: 'error', message: error.message }
  if (!pay?.order_number) return { status: 'error', message: 'Payment not found' }

  return syncSaasPaymentByOrderNumber(admin, pay.order_number)
}

/** Reconcile all pending SaaS payments for a user (e.g. after returning to billing). */
export async function syncPendingSaasPaymentsForUser(
  admin: SupabaseClient,
  userId: string
): Promise<{ synced: number; paid: number; errors: string[] }> {
  const { data: rows, error } = await admin
    .from('saas_payments')
    .select('order_number')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) return { synced: 0, paid: 0, errors: [error.message] }

  let synced = 0
  let paid = 0
  const errors: string[] = []

  for (const row of rows ?? []) {
    const result = await syncSaasPaymentByOrderNumber(admin, row.order_number)
    synced += 1
    if (result.status === 'paid') paid += 1
    else if (result.status === 'error') errors.push(result.message)
  }

  return { synced, paid, errors }
}
