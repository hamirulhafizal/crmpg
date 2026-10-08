import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { syncGoogleAdsMandateByOrderNumber } from '@/app/lib/google-ads/sync-bayarcash-mandate'
import { syncGoogleAdsPaymentByOrderNumber } from '@/app/lib/google-ads/sync-bayarcash-payment'

/** Participant lands here after Bayarcash return_url; polls until subscription activates. */
export async function GET(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  let orderNumber = ''
  for (const raw of url.searchParams.getAll('order_number')) {
    const s = sanitizeCrmOrderNumber(raw)
    if (s) {
      orderNumber = s
      break
    }
  }
  if (!orderNumber) {
    return NextResponse.json({ error: 'order_number is required' }, { status: 400 })
  }

  const { data: participant } = await supabase
    .from('google_ads_participants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!participant) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  const admin = createServiceRoleClient()

  // Direct Debit mandate orders (GADD-*) or rows linked to a mandate
  const isMandateOrder = orderNumber.startsWith('GADD-')
  if (isMandateOrder) {
    const { data: mandateRow } = await admin
      .from('google_ads_mandates')
      .select('order_number')
      .eq('order_number', orderNumber)
      .eq('participant_id', participant.id)
      .maybeSingle()

    if (!mandateRow) {
      return NextResponse.json({ error: 'Mandate not found' }, { status: 404 })
    }

    const result = await syncGoogleAdsMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    // Map mandate statuses onto the payment-complete UI contract
    if (result.status === 'active') return NextResponse.json({ status: 'paid', method: 'direct_debit' })
    if (result.status === 'failed') return NextResponse.json({ status: 'failed', method: 'direct_debit' })
    return NextResponse.json({ status: 'pending', method: 'direct_debit' })
  }

  const { data: paymentRow } = await supabase
    .from('google_ads_payments')
    .select('order_number, mandate_id')
    .eq('order_number', orderNumber)
    .eq('participant_id', participant.id)
    .maybeSingle()

  if (!paymentRow) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (paymentRow.mandate_id) {
    const result = await syncGoogleAdsMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    if (result.status === 'active') return NextResponse.json({ status: 'paid', method: 'direct_debit' })
    if (result.status === 'failed') return NextResponse.json({ status: 'failed', method: 'direct_debit' })
    return NextResponse.json({ status: 'pending', method: 'direct_debit' })
  }

  const result = await syncGoogleAdsPaymentByOrderNumber(admin, orderNumber)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ status: result.status, method: 'fpx' })
}
