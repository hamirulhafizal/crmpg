import { NextResponse } from 'next/server'
import {
  isBayarcashConfiguredForCheckout,
  isBayarcashConfiguredForDirectDebit,
  isGoogleAdsBayarcashDirectDebitEnabled,
  isGoogleAdsBayarcashRenewalEnabled,
} from '@/app/lib/bayarcash/config'
import { createClient } from '@/app/lib/supabase/server'

/** Participant: subscription summary + active packages for renewal selection. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { data: participant, error: pError } = await supabase
      .from('google_ads_participants')
      .select('id, user_id, notes, created_at')
      .eq('user_id', user.id)
      .maybeSingle()

    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 })
    if (!participant) {
      return NextResponse.json({ enrolled: false as const })
    }

    const { data: subscription, error: sError } = await supabase
      .from('google_ads_subscriptions')
      .select(
        `
        id,
        package_id,
        status,
        current_period_start,
        current_period_end,
        pending_renewal_package_id,
        payment_provider,
        external_payment_id,
        payment_metadata,
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
      .eq('participant_id', participant.id)
      .maybeSingle()

    if (sError) return NextResponse.json({ error: sError.message }, { status: 500 })

    const { data: packages, error: pkgError } = await supabase
      .from('google_ads_packages')
      .select('id, name, billing_period, price_amount, currency, is_active, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (pkgError) return NextResponse.json({ error: pkgError.message }, { status: 500 })

    const { data: payments, error: payErr } = await supabase
      .from('google_ads_payments')
      .select(
        `
        id,
        order_number,
        amount,
        currency,
        status,
        receipt_label,
        exchange_reference_number,
        bayarcash_transaction_id,
        payment_intent_id,
        created_at,
        updated_at,
        package:google_ads_packages!package_id (
          id,
          name,
          billing_period,
          price_amount,
          currency
        )
      `
      )
      .eq('participant_id', participant.id)
      .order('created_at', { ascending: false })
      .limit(25)

    if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })

    const bayarcashCheckoutEnabled =
      isGoogleAdsBayarcashRenewalEnabled() && isBayarcashConfiguredForCheckout()

    const bayarcashDirectDebitEnabled =
      bayarcashCheckoutEnabled &&
      isGoogleAdsBayarcashDirectDebitEnabled() &&
      isBayarcashConfiguredForDirectDebit()

    const { data: profile } = await supabase
      .from('profiles')
      .select('phone')
      .eq('id', user.id)
      .maybeSingle()

    let activeMandate: {
      id: string
      status: string
      order_number: string
      amount: number
      frequency_mode: string
      created_at: string
      updated_at: string
    } | null = null
    try {
      const { data: mandateRow } = await supabase
        .from('google_ads_mandates')
        .select('id, status, order_number, amount, frequency_mode, created_at, updated_at')
        .eq('participant_id', participant.id)
        .in('status', ['pending_enrollment', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      activeMandate = mandateRow ?? null
    } catch {
      activeMandate = null
    }

    return NextResponse.json({
      enrolled: true as const,
      participant,
      subscription: subscription ?? null,
      packages: packages || [],
      payments: payments || [],
      bayarcashCheckoutEnabled,
      bayarcashDirectDebitEnabled,
      profilePhone: profile?.phone ?? null,
      mandate: activeMandate,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load subscription' }, { status: 500 })
  }
}
