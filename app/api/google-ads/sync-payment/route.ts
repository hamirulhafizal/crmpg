import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
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

  const { data: paymentRow } = await supabase
    .from('google_ads_payments')
    .select('order_number')
    .eq('order_number', orderNumber)
    .eq('participant_id', participant.id)
    .maybeSingle()

  if (!paymentRow) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const admin = createServiceRoleClient()
  const result = await syncGoogleAdsPaymentByOrderNumber(admin, orderNumber)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ status: result.status })
}
