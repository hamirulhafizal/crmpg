import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createPaymentIntent } from '@/app/lib/bayarcash/payment-intent'
import { isGoogleAdsBayarcashRenewalEnabled } from '@/app/lib/bayarcash/config'
import { canRequestRenewal } from '@/app/lib/google-ads/billing'
import { getOrCreatePendingGoogleAdsSubscription } from '@/app/lib/google-ads/bootstrap-subscription'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type Body = { package_id?: string }

function getAppOrigin(request: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  const u = new URL(request.url)
  return `${u.protocol}//${u.host}`
}

function newOrderNumber(): string {
  return `GADS-${randomBytes(6).toString('hex').toUpperCase()}`
}

/**
 * Create Bayarcash payment intent for Google Ads renewal (package + checkout in one step).
 */
export async function POST(request: Request) {
  if (!isGoogleAdsBayarcashRenewalEnabled()) {
    return NextResponse.json({ error: 'Online payment is not enabled' }, { status: 403 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user?.email) {
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

  const admin = createServiceRoleClient()

  try {
    const { data: participant, error: pError } = await admin
      .from('google_ads_participants')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 })
    if (!participant) {
      return NextResponse.json({ error: 'You are not enrolled in this program' }, { status: 403 })
    }

    const { data: pkg, error: pkgErr } = await admin
      .from('google_ads_packages')
      .select('id, billing_period, price_amount, currency, is_active')
      .eq('id', packageId)
      .maybeSingle()

    if (pkgErr || !pkg?.is_active) {
      return NextResponse.json({ error: 'Invalid or inactive package' }, { status: 400 })
    }

    const boot = await getOrCreatePendingGoogleAdsSubscription(admin, participant.id, packageId)
    if (!boot.ok) {
      return NextResponse.json({ error: boot.error }, { status: 400 })
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
        {
          error:
            'Renewal is only available in the last 7 days before expiry, after expiry, or when payment is pending.',
        },
        { status: 409 }
      )
    }

    const amountMyr = Number(pkg.price_amount)
    if (!Number.isFinite(amountMyr) || amountMyr <= 0) {
      return NextResponse.json({ error: 'Invalid package price' }, { status: 400 })
    }

    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const payerName = (profile?.full_name || '').trim() || user.email.split('@')[0] || 'Customer'
    const payerEmail = user.email.trim()

    const prevMeta = (subscription.payment_metadata as Record<string, unknown>) || {}
    const payment_metadata = {
      ...prevMeta,
      renewal_requested_at: new Date().toISOString(),
      renewal_package_id: packageId,
    }

    await admin
      .from('google_ads_payments')
      .update({ status: 'cancelled' })
      .eq('participant_id', participant.id)
      .eq('status', 'pending')

    const { error: uSub } = await admin
      .from('google_ads_subscriptions')
      .update({
        pending_renewal_package_id: packageId,
        status: 'pending_payment',
        payment_provider: 'bayarcash',
        payment_metadata,
      })
      .eq('id', subscription.id)

    if (uSub) return NextResponse.json({ error: uSub.message }, { status: 400 })

    const orderNumber = newOrderNumber()
    const origin = getAppOrigin(request)
    // Path only — Bayarcash appends its own `?order_number=…&…`; a pre-filled query caused a second `?`
    // and mangled `order_number` values like `GADS-xxx?payment_intent_id=…` (payment not found).
    const returnUrl = `${origin}/google-ads/payment/complete`
    const callbackUrl = `${origin}/api/webhooks/bayarcash/google-ads`

    const { data: payInsert, error: payErr } = await admin
      .from('google_ads_payments')
      .insert({
        participant_id: participant.id,
        subscription_id: subscription.id,
        package_id: packageId,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(pkg.currency || 'MYR'),
        status: 'pending',
        payer_name: payerName,
        payer_email: payerEmail,
        metadata: { source: 'google_ads_checkout' },
      })
      .select('id')
      .single()

    if (payErr || !payInsert) {
      return NextResponse.json({ error: payErr?.message || 'Failed to create payment record' }, { status: 400 })
    }

    const pi = await createPaymentIntent({
      orderNumber,
      amountMyr,
      payerName,
      payerEmail,
      returnUrl,
      callbackUrl,
      metadata: JSON.stringify({ flow: 'google_ads', participant_id: participant.id }),
    })

    if (!pi.ok) {
      await admin.from('google_ads_payments').delete().eq('id', payInsert.id)
      return NextResponse.json(
        { error: pi.error, detail: pi.body },
        { status: pi.status && pi.status >= 400 ? pi.status : 502 }
      )
    }

    const { error: updPay } = await admin
      .from('google_ads_payments')
      .update({ payment_intent_id: pi.data.id })
      .eq('id', payInsert.id)

    if (updPay) {
      await admin.from('google_ads_payments').delete().eq('id', payInsert.id)
      return NextResponse.json({ error: updPay.message }, { status: 400 })
    }

    return NextResponse.json({
      checkoutUrl: pi.data.url,
      orderNumber,
      paymentIntentId: pi.data.id,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
