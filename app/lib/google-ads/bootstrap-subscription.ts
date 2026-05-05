import type { SupabaseClient } from '@supabase/supabase-js'

const SUB_FIELDS =
  'id, status, current_period_start, current_period_end, package_id, pending_renewal_package_id, payment_metadata'

export type GoogleAdsSubscriptionBootstrapRow = {
  id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  package_id: string
  pending_renewal_package_id: string | null
  payment_metadata: Record<string, unknown>
}

/**
 * Participant enrolled but no subscription row yet — create pending_payment so checkout / renew can proceed.
 */
export async function getOrCreatePendingGoogleAdsSubscription(
  admin: SupabaseClient,
  participantId: string,
  packageId: string
): Promise<
  | { ok: true; subscription: GoogleAdsSubscriptionBootstrapRow; created: boolean }
  | { ok: false; error: string }
> {
  const { data: existing, error: e1 } = await admin
    .from('google_ads_subscriptions')
    .select(SUB_FIELDS)
    .eq('participant_id', participantId)
    .maybeSingle()

  if (e1) return { ok: false, error: e1.message }
  if (existing) {
    return { ok: true, subscription: existing as GoogleAdsSubscriptionBootstrapRow, created: false }
  }

  const { data: pkg, error: pe } = await admin
    .from('google_ads_packages')
    .select('id, is_active')
    .eq('id', packageId)
    .maybeSingle()

  if (pe || !pkg?.is_active) return { ok: false, error: 'Invalid or inactive package' }

  const { data: inserted, error: insErr } = await admin
    .from('google_ads_subscriptions')
    .insert({
      participant_id: participantId,
      package_id: packageId,
      status: 'pending_payment',
      current_period_start: null,
      current_period_end: null,
      payment_provider: 'bayarcash',
      payment_metadata: {
        self_service_subscription: true,
        enrollment_requested_at: new Date().toISOString(),
      },
    })
    .select(SUB_FIELDS)
    .single()

  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message || 'Failed to create subscription' }
  }

  return { ok: true, subscription: inserted as GoogleAdsSubscriptionBootstrapRow, created: true }
}
