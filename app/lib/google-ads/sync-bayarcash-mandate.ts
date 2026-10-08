import type { SupabaseClient } from '@supabase/supabase-js'

import { getMandateByOrderNumber, isMandateApprovedStatus } from '@/app/lib/bayarcash/mandate'
import { activateGoogleAdsSubscriptionAfterPayment } from '@/app/lib/google-ads/activate-subscription-after-payment'

/**
 * Sync e-Mandate enrollment status from Bayarcash.
 * On approved/active: mark mandate active and activate subscription for the linked package
 * (first period starts when bank mandate is approved — recurring collections continue via DD).
 */
export async function syncGoogleAdsMandateByOrderNumber(
  admin: SupabaseClient,
  orderNumber: string
): Promise<
  | { status: 'active' }
  | { status: 'pending' }
  | { status: 'failed' }
  | { status: 'error'; message: string }
> {
  const { data: mandate, error } = await admin
    .from('google_ads_mandates')
    .select('id, participant_id, subscription_id, package_id, status, bayarcash_mandate_id, amount, currency')
    .eq('order_number', orderNumber)
    .maybeSingle()

  if (error) return { status: 'error', message: error.message }
  if (!mandate) return { status: 'error', message: 'Mandate not found' }
  if (mandate.status === 'active') return { status: 'active' }
  if (mandate.status === 'failed' || mandate.status === 'cancelled' || mandate.status === 'terminated') {
    return { status: 'failed' }
  }

  const remote = await getMandateByOrderNumber(orderNumber)
  if (!remote.ok) return { status: 'error', message: remote.error }

  const remoteStatus = remote.data.status
  const statusDesc =
    typeof remote.data.status_description === 'string'
      ? remote.data.status_description
      : String(remoteStatus ?? '')

  const bayarcashId =
    typeof remote.data.id === 'string' && remote.data.id
      ? remote.data.id
      : mandate.bayarcash_mandate_id

  if (isMandateApprovedStatus(remoteStatus) || isMandateApprovedStatus(statusDesc)) {
    const { error: uMand } = await admin
      .from('google_ads_mandates')
      .update({
        status: 'active',
        bayarcash_mandate_id: bayarcashId || null,
        metadata: {
          last_sync_at: new Date().toISOString(),
          bayarcash_mandate: remote.data,
        },
      })
      .eq('id', mandate.id)

    if (uMand) return { status: 'error', message: uMand.message }

    // Ensure a paid payment row exists for receipt history
    const { data: existingPay } = await admin
      .from('google_ads_payments')
      .select('id, status')
      .eq('order_number', orderNumber)
      .maybeSingle()

    if (existingPay && existingPay.status !== 'paid') {
      await admin
        .from('google_ads_payments')
        .update({
          status: 'paid',
          mandate_id: mandate.id,
          receipt_label: `Direct Debit mandate ${orderNumber}`,
          bayarcash_transaction_id: bayarcashId || null,
          metadata: { mandate: remote.data, source: 'direct_debit_enrollment' },
        })
        .eq('id', existingPay.id)
    } else if (!existingPay) {
      await admin.from('google_ads_payments').insert({
        participant_id: mandate.participant_id,
        subscription_id: mandate.subscription_id,
        package_id: mandate.package_id,
        mandate_id: mandate.id,
        order_number: orderNumber,
        amount: mandate.amount,
        currency: mandate.currency || 'MYR',
        status: 'paid',
        receipt_label: `Direct Debit mandate ${orderNumber}`,
        bayarcash_transaction_id: bayarcashId || null,
        metadata: { mandate: remote.data, source: 'direct_debit_enrollment' },
      })
    }

    const act = await activateGoogleAdsSubscriptionAfterPayment(admin, mandate.participant_id, {
      externalPaymentId: bayarcashId || orderNumber,
      paymentMetadataExtra: {
        payment_method: 'direct_debit',
        bayarcash_mandate_order: orderNumber,
        bayarcash_mandate: remote.data,
        last_sync_at: new Date().toISOString(),
      },
    })
    if (!act.ok) return { status: 'error', message: act.error }

    return { status: 'active' }
  }

  const failed =
    typeof remoteStatus === 'number'
      ? [2, 4, 5, 6].includes(remoteStatus)
      : /reject|fail|cancel|error|terminat/i.test(String(remoteStatus ?? statusDesc))

  if (failed) {
    await admin
      .from('google_ads_mandates')
      .update({
        status: 'failed',
        bayarcash_mandate_id: bayarcashId || null,
        metadata: { last_sync_at: new Date().toISOString(), bayarcash_mandate: remote.data },
      })
      .eq('id', mandate.id)

    await admin
      .from('google_ads_payments')
      .update({ status: 'failed', metadata: { mandate: remote.data } })
      .eq('order_number', orderNumber)
      .eq('status', 'pending')

    return { status: 'failed' }
  }

  await admin
    .from('google_ads_mandates')
    .update({
      bayarcash_mandate_id: bayarcashId || null,
      metadata: { last_sync_at: new Date().toISOString(), bayarcash_mandate: remote.data },
    })
    .eq('id', mandate.id)

  return { status: 'pending' }
}
