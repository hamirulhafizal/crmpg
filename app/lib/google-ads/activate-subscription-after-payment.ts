import type { SupabaseClient } from '@supabase/supabase-js'

import { addBillingPeriod } from '@/app/lib/google-ads/billing'

export type ActivateSubscriptionOptions = {
  externalPaymentId?: string | null
  paymentMetadataExtra?: Record<string, unknown>
}

/**
 * Applies renewal package, activates subscription period (Bayarcash / manual confirm).
 */
export async function activateGoogleAdsSubscriptionAfterPayment(
  admin: SupabaseClient,
  participantId: string,
  options: ActivateSubscriptionOptions = {}
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: subRow, error: subErr } = await admin
    .from('google_ads_subscriptions')
    .select('id, package_id, pending_renewal_package_id, payment_metadata')
    .eq('participant_id', participantId)
    .maybeSingle()

  if (subErr || !subRow) {
    return { ok: false, error: 'Subscription not found for participant' }
  }

  const targetPackageId = subRow.pending_renewal_package_id || subRow.package_id

  const { data: pkg, error: pkgErr } = await admin
    .from('google_ads_packages')
    .select('id, billing_period, is_active')
    .eq('id', targetPackageId)
    .maybeSingle()

  if (pkgErr || !pkg?.is_active) {
    return { ok: false, error: 'Target package missing or inactive' }
  }

  const billingPeriod = pkg.billing_period as 'monthly' | 'yearly'
  const periodStart = new Date()
  const periodEnd = addBillingPeriod(periodStart, billingPeriod)

  const prevMeta = (subRow.payment_metadata as Record<string, unknown>) || {}
  const mergedMeta = {
    ...prevMeta,
    ...(options.paymentMetadataExtra && typeof options.paymentMetadataExtra === 'object'
      ? options.paymentMetadataExtra
      : {}),
    payment_confirmed_at: new Date().toISOString(),
    payment_provider: 'bayarcash',
  }

  const { error: updErr } = await admin
    .from('google_ads_subscriptions')
    .update({
      package_id: targetPackageId,
      pending_renewal_package_id: null,
      status: 'active',
      current_period_start: periodStart.toISOString(),
      current_period_end: periodEnd.toISOString(),
      external_payment_id:
        typeof options.externalPaymentId === 'string' ? options.externalPaymentId.trim() || null : null,
      payment_metadata: mergedMeta,
    })
    .eq('id', subRow.id)

  if (updErr) return { ok: false, error: updErr.message }
  return { ok: true }
}
