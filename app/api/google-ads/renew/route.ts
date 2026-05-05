import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { canRequestRenewal } from '@/app/lib/google-ads/billing'
import { getOrCreatePendingGoogleAdsSubscription } from '@/app/lib/google-ads/bootstrap-subscription'

type Body = { package_id?: string }

/**
 * Participant requests renewal: chooses pakej for the next term (only when renewal is allowed).
 * Sets pending_payment — confirm via admin confirm-payment or future Bayarcash webhook.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const packageId = typeof body.package_id === 'string' ? body.package_id.trim() : ''
  if (!packageId) return NextResponse.json({ error: 'package_id is required' }, { status: 400 })

  try {
    const { data: participant, error: pError } = await supabase
      .from('google_ads_participants')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 })
    if (!participant) {
      return NextResponse.json({ error: 'You are not enrolled in this program' }, { status: 403 })
    }

    const admin = createServiceRoleClient()

    const boot = await getOrCreatePendingGoogleAdsSubscription(admin, participant.id, packageId)
    if (!boot.ok) {
      return NextResponse.json({ error: boot.error }, { status: 400 })
    }

    if (boot.created) {
      const { data: fullSub, error: fullErr } = await admin
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
        .eq('id', boot.subscription.id)
        .single()

      if (fullErr || !fullSub) {
        return NextResponse.json({ error: fullErr?.message || 'Failed to load subscription' }, { status: 500 })
      }

      return NextResponse.json({
        subscription: fullSub,
        message:
          'Subscription created. Complete payment when checkout is available; an administrator can confirm payment meanwhile.',
      })
    }

    const subscription = boot.subscription

    if (
      !canRequestRenewal({
        status: subscription.status,
        current_period_start: subscription.current_period_start,
        current_period_end: subscription.current_period_end,
      })
    ) {
      return NextResponse.json(
        { error: 'Renewal is only available in the last 7 days before expiry, after expiry, or when payment is pending.' },
        { status: 409 }
      )
    }
    const { data: pkg, error: pkgErr } = await admin
      .from('google_ads_packages')
      .select('id, is_active')
      .eq('id', packageId)
      .maybeSingle()

    if (pkgErr || !pkg?.is_active) {
      return NextResponse.json({ error: 'Invalid or inactive package' }, { status: 400 })
    }

    const prevMeta = (subscription.payment_metadata as Record<string, unknown>) || {}
    const payment_metadata = {
      ...prevMeta,
      renewal_requested_at: new Date().toISOString(),
      renewal_package_id: packageId,
    }

    const { data: updated, error: uErr } = await admin
      .from('google_ads_subscriptions')
      .update({
        pending_renewal_package_id: packageId,
        status: 'pending_payment',
        payment_provider: 'bayarcash',
        payment_metadata,
      })
      .eq('id', subscription.id)
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
      .single()

    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

    return NextResponse.json({
      subscription: updated,
      message:
        'Renewal request recorded. Complete payment when checkout is available; an administrator can confirm payment meanwhile.',
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to request renewal' }, { status: 500 })
  }
}
