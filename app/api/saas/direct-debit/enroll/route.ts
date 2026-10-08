import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import {
  isBayarcashConfiguredForDirectDebit,
  isGoogleAdsBayarcashDirectDebitEnabled,
  isGoogleAdsBayarcashRenewalEnabled,
} from '@/app/lib/bayarcash/config'
import { createMandateEnrollment } from '@/app/lib/bayarcash/mandate'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { canCheckoutPro, checkoutPriceAmount } from '@/app/lib/saas/billing'
import { buildSaasMePayload } from '@/app/lib/saas/entitlements'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type Body = {
  payer_id?: string
  payer_phone?: string
}

function getAppOrigin(request: Request): string {
  const fromEnv = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || '')
    .trim()
    .replace(/\/+$/, '')
  if (fromEnv) return fromEnv
  const u = new URL(request.url)
  return `${u.protocol}//${u.host}`
}

function newOrderNumber(): string {
  return `SADD-${randomBytes(6).toString('hex').toUpperCase()}`
}

function tomorrowYmd(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function plusYearsYmd(years: number): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + years)
  return d.toISOString().slice(0, 10)
}

/** Start Bayarcash FPX Direct Debit enrollment for CRM Pro. */
export async function POST(request: Request) {
  if (!isGoogleAdsBayarcashRenewalEnabled() || !isGoogleAdsBayarcashDirectDebitEnabled()) {
    return NextResponse.json({ error: 'Direct Debit is not enabled' }, { status: 403 })
  }
  if (!isBayarcashConfiguredForDirectDebit()) {
    return NextResponse.json({ error: 'Bayarcash Direct Debit is not configured' }, { status: 503 })
  }

  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user } = auth
  if (!user.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const payerIdRaw = typeof body.payer_id === 'string' ? body.payer_id.trim() : ''
  const payerPhoneRaw = typeof body.payer_phone === 'string' ? body.payer_phone.trim() : ''
  if (!payerIdRaw) {
    return NextResponse.json({ error: 'NRIC / IC number is required' }, { status: 400 })
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

    const upgradingFromTrial = sub.plan.slug === 'pro' && sub.status === 'trialing'
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

    const { data: profile } = await admin
      .from('profiles')
      .select('full_name, phone')
      .eq('id', user.id)
      .maybeSingle()

    const payerName = (profile?.full_name || '').trim() || user.email.split('@')[0] || 'Customer'
    const payerEmail = user.email.trim()
    const payerPhone = payerPhoneRaw || (profile?.phone || '').trim()
    if (!payerPhone) {
      return NextResponse.json(
        { error: 'Phone number is required for Direct Debit. Enter it below or update your profile.' },
        { status: 400 }
      )
    }

    const frequencyMode =
      proPlan.billing_period === 'yearly' ? ('YR' as const) : ('MT' as const)
    const applicationReason = `CRM Pro ${proPlan.name || 'subscription'}`.slice(0, 200)

    await admin
      .from('saas_payments')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'pending')

    await admin
      .from('saas_mandates')
      .update({ status: 'cancelled' })
      .eq('user_id', user.id)
      .eq('status', 'pending_enrollment')

    const prevMeta = (sub.payment_metadata ?? {}) as Record<string, unknown>
    await admin
      .from('saas_subscriptions')
      .update({
        payment_provider: 'bayarcash',
        payment_metadata: {
          ...prevMeta,
          checkout_requested_at: new Date().toISOString(),
          checkout_plan_id: proPlan.id,
          payment_method: 'direct_debit',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    const orderNumber = newOrderNumber()
    const origin = getAppOrigin(request)
    const returnUrl = `${origin}/dashboard/billing/payment/complete`
    const successUrl = returnUrl
    const failedUrl = returnUrl

    const { data: mandInsert, error: mandErr } = await admin
      .from('saas_mandates')
      .insert({
        user_id: user.id,
        subscription_id: sub.id,
        plan_id: proPlan.id,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(proPlan.currency || 'MYR'),
        frequency_mode: frequencyMode,
        status: 'pending_enrollment',
        payer_name: payerName,
        payer_email: payerEmail,
        payer_phone: payerPhone,
        payer_id_type: 1,
        payer_id_last4: payerIdRaw.replace(/\D/g, '').slice(-4),
        application_reason: applicationReason,
        effective_date: tomorrowYmd(),
        expiry_date: plusYearsYmd(5),
        metadata: { source: 'saas_direct_debit', is_renewal: isRenewal, from_trial: upgradingFromTrial },
      })
      .select('id')
      .single()

    if (mandErr || !mandInsert) {
      return NextResponse.json({ error: mandErr?.message || 'Failed to create mandate record' }, { status: 400 })
    }

    const { data: payInsert, error: payErr } = await admin
      .from('saas_payments')
      .insert({
        subscription_id: sub.id,
        user_id: user.id,
        plan_id: proPlan.id,
        mandate_id: mandInsert.id,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(proPlan.currency || 'MYR'),
        status: 'pending',
        payer_name: payerName,
        payer_email: payerEmail,
        payer_phone: payerPhone,
        metadata: { source: 'saas_direct_debit', is_renewal: isRenewal, from_trial: upgradingFromTrial },
      })
      .select('id')
      .single()

    if (payErr || !payInsert) {
      await admin.from('saas_mandates').delete().eq('id', mandInsert.id)
      return NextResponse.json({ error: payErr?.message || 'Failed to create payment record' }, { status: 400 })
    }

    const enroll = await createMandateEnrollment({
      orderNumber,
      amountMyr,
      payerName,
      payerEmail,
      payerPhone,
      payerId: payerIdRaw,
      applicationReason,
      frequencyMode,
      effectiveDate: tomorrowYmd(),
      expiryDate: plusYearsYmd(5),
      returnUrl,
      successUrl,
      failedUrl,
      metadata: JSON.stringify({ flow: 'saas_dd', user_id: user.id, plan_id: proPlan.id }),
    })

    if (!enroll.ok) {
      await admin.from('saas_payments').delete().eq('id', payInsert.id)
      await admin.from('saas_mandates').delete().eq('id', mandInsert.id)
      return NextResponse.json(
        { error: enroll.error, detail: enroll.body },
        { status: enroll.status && enroll.status >= 400 ? enroll.status : 502 }
      )
    }

    await admin
      .from('saas_mandates')
      .update({ enroll_url: enroll.data.url, metadata: { bayarcash_create: enroll.data.raw } })
      .eq('id', mandInsert.id)

    return NextResponse.json({
      enrollUrl: enroll.data.url,
      orderNumber,
      mandateId: mandInsert.id,
      amount: amountMyr,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Direct Debit enrollment failed' }, { status: 500 })
  }
}
