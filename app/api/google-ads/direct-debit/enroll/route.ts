import { randomBytes } from 'crypto'
import { NextResponse } from 'next/server'
import {
  isBayarcashConfiguredForDirectDebit,
  isGoogleAdsBayarcashDirectDebitEnabled,
  isGoogleAdsBayarcashRenewalEnabled,
} from '@/app/lib/bayarcash/config'
import { createMandateEnrollment } from '@/app/lib/bayarcash/mandate'
import { canRequestRenewal } from '@/app/lib/google-ads/billing'
import { getOrCreatePendingGoogleAdsSubscription } from '@/app/lib/google-ads/bootstrap-subscription'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type Body = {
  package_id?: string
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
  return `GADD-${randomBytes(6).toString('hex').toUpperCase()}`
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

/**
 * Start Bayarcash FPX Direct Debit (e-Mandate) enrollment for Google Ads.
 */
export async function POST(request: Request) {
  if (!isGoogleAdsBayarcashRenewalEnabled() || !isGoogleAdsBayarcashDirectDebitEnabled()) {
    return NextResponse.json({ error: 'Direct Debit is not enabled' }, { status: 403 })
  }
  if (!isBayarcashConfiguredForDirectDebit()) {
    return NextResponse.json({ error: 'Bayarcash Direct Debit is not configured' }, { status: 503 })
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
  const payerIdRaw = typeof body.payer_id === 'string' ? body.payer_id.trim() : ''
  const payerPhoneRaw = typeof body.payer_phone === 'string' ? body.payer_phone.trim() : ''

  if (!packageId) return NextResponse.json({ error: 'package_id is required' }, { status: 400 })
  if (!payerIdRaw) return NextResponse.json({ error: 'NRIC / IC number is required' }, { status: 400 })

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
      .select('id, name, billing_period, price_amount, currency, is_active')
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

    const frequencyMode = pkg.billing_period === 'yearly' ? 'YR' : 'MT'
    const applicationReason = `Google Ads ${pkg.name || 'subscription'}`.slice(0, 200)

    const prevMeta = (subscription.payment_metadata as Record<string, unknown>) || {}
    const payment_metadata = {
      ...prevMeta,
      renewal_requested_at: new Date().toISOString(),
      renewal_package_id: packageId,
      payment_method: 'direct_debit',
    }

    await admin
      .from('google_ads_payments')
      .update({ status: 'cancelled' })
      .eq('participant_id', participant.id)
      .eq('status', 'pending')

    await admin
      .from('google_ads_mandates')
      .update({ status: 'cancelled' })
      .eq('participant_id', participant.id)
      .eq('status', 'pending_enrollment')

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
    const returnUrl = `${origin}/google-ads/payment/complete`
    const successUrl = `${origin}/google-ads/payment/complete`
    const failedUrl = `${origin}/google-ads/payment/complete`

    const { data: mandInsert, error: mandErr } = await admin
      .from('google_ads_mandates')
      .insert({
        participant_id: participant.id,
        subscription_id: subscription.id,
        package_id: packageId,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(pkg.currency || 'MYR'),
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
        metadata: { source: 'google_ads_direct_debit' },
      })
      .select('id')
      .single()

    if (mandErr || !mandInsert) {
      return NextResponse.json({ error: mandErr?.message || 'Failed to create mandate record' }, { status: 400 })
    }

    const { data: payInsert, error: payErr } = await admin
      .from('google_ads_payments')
      .insert({
        participant_id: participant.id,
        subscription_id: subscription.id,
        package_id: packageId,
        mandate_id: mandInsert.id,
        order_number: orderNumber,
        amount: amountMyr,
        currency: String(pkg.currency || 'MYR'),
        status: 'pending',
        payer_name: payerName,
        payer_email: payerEmail,
        metadata: { source: 'google_ads_direct_debit' },
      })
      .select('id')
      .single()

    if (payErr || !payInsert) {
      await admin.from('google_ads_mandates').delete().eq('id', mandInsert.id)
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
      metadata: JSON.stringify({ flow: 'google_ads_dd', participant_id: participant.id }),
    })

    if (!enroll.ok) {
      await admin.from('google_ads_payments').delete().eq('id', payInsert.id)
      await admin.from('google_ads_mandates').delete().eq('id', mandInsert.id)
      return NextResponse.json(
        { error: enroll.error, detail: enroll.body },
        { status: enroll.status && enroll.status >= 400 ? enroll.status : 502 }
      )
    }

    await admin
      .from('google_ads_mandates')
      .update({ enroll_url: enroll.data.url, metadata: { bayarcash_create: enroll.data.raw } })
      .eq('id', mandInsert.id)

    return NextResponse.json({
      enrollUrl: enroll.data.url,
      orderNumber,
      mandateId: mandInsert.id,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Direct Debit enrollment failed' }, { status: 500 })
  }
}
