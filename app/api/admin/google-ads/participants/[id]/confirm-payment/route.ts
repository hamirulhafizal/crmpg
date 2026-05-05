import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { activateGoogleAdsSubscriptionAfterPayment } from '@/app/lib/google-ads/activate-subscription-after-payment'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * Ops / Bayarcash webhook (later): mark payment received and start or extend the billing period.
 * Uses pending_renewal_package_id when the participant chose a package at renewal.
 */
export async function POST(request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing participant id' }, { status: 400 })

  let body: { external_payment_id?: string | null; payment_metadata?: Record<string, unknown> }
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  try {
    const admin = createServiceRoleClient()

    const act = await activateGoogleAdsSubscriptionAfterPayment(admin, id, {
      externalPaymentId: body.external_payment_id,
      paymentMetadataExtra:
        body.payment_metadata && typeof body.payment_metadata === 'object' ? body.payment_metadata : undefined,
    })
    if (!act.ok) {
      const status = act.error.includes('not found') ? 404 : 400
      return NextResponse.json({ error: act.error }, { status })
    }

    const { data: updated } = await admin
      .from('google_ads_subscriptions')
      .select(
        `
        *,
        package:google_ads_packages!package_id (
          id,
          name,
          billing_period,
          price_amount,
          currency,
          is_active
        )
      `
      )
      .eq('participant_id', id)
      .single()

    return NextResponse.json({ subscription: updated })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to confirm payment' }, { status: 500 })
  }
}
