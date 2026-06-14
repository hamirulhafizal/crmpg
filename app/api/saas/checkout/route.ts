import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import { createPaymentIntent } from '@/app/lib/bayarcash/payment-intent'
import { isGoogleAdsBayarcashRenewalEnabled } from '@/app/lib/bayarcash/config'
import { checkoutPriceAmount, canCheckoutPro } from '@/app/lib/saas/billing'
import { buildSaasMePayload } from '@/app/lib/saas/entitlements'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

function getAppOrigin(request: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  const u = new URL(request.url)
  return `${u.protocol}//${u.host}`
}

function newOrderNumber(): string {
  return `SAAS-${randomBytes(6).toString('hex').toUpperCase()}`
}

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

  const admin = createServiceRoleClient()

  try {
    const me = await buildSaasMePayload(user.id)
    if (!me) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

    const proPlan = me.plans.find((p) => p.slug === 'pro')
    if (!proPlan?.is_active) {
      return NextResponse.json({ error: 'Pro plan is not available' }, { status: 400 })
    }

    const sub = me.subscription
    const canCheckout = canCheckoutPro({
      planSlug: sub.plan.slug,
      status: sub.status,
      trialEndsAt: sub.trial_ends_at,
      currentPeriodEnd: sub.current_period_end,
    })

    if (!canCheckout) {
      return NextResponse.json(
        { error: 'Pro is already active. Renewal opens in the last 7 days before expiry.' },
        { status: 409 }
      )
    }

    const upgradingFromTrial =
      sub.plan.slug === 'pro' && sub.status === 'trialing'
    const isRenewal =
      sub.plan.slug === 'pro' && Number(sub.locked_price_amount) > 0 && !upgradingFromTrial
    const amountMyr = checkoutPriceAmount({
      planListPrice: Number(proPlan.price_amount),
      lockedPrice: Number(sub.locked_price_amount),
      planSlug: proPlan.slug,
      isRenewal,
    })

    if (!Number.isFinite(amountMyr) || amountMyr <= 0) {
      return NextResponse.json({ error: 'Invalid plan price' }, { status: 400 })
    }

    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    const payerName = (profile?.full_name || '').trim() || user.email.split('@')[0] || 'Customer'
    const payerEmail = user.email.trim()

    await admin
      .from('saas_payments')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'pending')

    const prevMeta = (sub.payment_metadata ?? {}) as Record<string, unknown>
    await admin
      .from('saas_subscriptions')
      .update({
        payment_provider: 'bayarcash',
        payment_metadata: {
          ...prevMeta,
          checkout_requested_at: new Date().toISOString(),
          checkout_plan_id: proPlan.id,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    const orderNumber = newOrderNumber()
    const origin = getAppOrigin(request)
    const returnUrl = `${origin}/dashboard/billing/payment/complete`
    const callbackUrl = `${origin}/api/webhooks/bayarcash/saas`

    const { data: payInsert, error: payErr } = await admin
      .from('saas_payments')
      .insert({
        subscription_id: sub.id,
        user_id: user.id,
        plan_id: proPlan.id,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(proPlan.currency || 'MYR'),
        status: 'pending',
        payer_name: payerName,
        payer_email: payerEmail,
        metadata: { source: 'saas_checkout', is_renewal: isRenewal, from_trial: upgradingFromTrial },
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
      metadata: JSON.stringify({ flow: 'saas', user_id: user.id, plan_id: proPlan.id }),
    })

    if (!pi.ok) {
      await admin.from('saas_payments').delete().eq('id', payInsert.id)
      return NextResponse.json(
        { error: pi.error, detail: pi.body },
        { status: pi.status && pi.status >= 400 ? pi.status : 502 }
      )
    }

    const { error: updPay } = await admin
      .from('saas_payments')
      .update({ payment_intent_id: pi.data.id })
      .eq('id', payInsert.id)

    if (updPay) {
      await admin.from('saas_payments').delete().eq('id', payInsert.id)
      return NextResponse.json({ error: updPay.message }, { status: 400 })
    }

    return NextResponse.json({
      checkoutUrl: pi.data.url,
      orderNumber,
      paymentIntentId: pi.data.id,
      amount: amountMyr,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Checkout failed' }, { status: 500 })
  }
}
