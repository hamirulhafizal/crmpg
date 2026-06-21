import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import {
  syncPendingSaasPaymentsForUser,
  syncSaasPaymentByOrderNumber,
  syncSaasPaymentByPaymentIntentId,
} from '@/app/lib/saas/sync-bayarcash-payment'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

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
  const syncAllPending = url.searchParams.get('sync_pending') === '1'
  const paymentIntentId = (url.searchParams.get('payment_intent_id') || '').trim()

  const admin = createServiceRoleClient()

  if (syncAllPending) {
    const result = await syncPendingSaasPaymentsForUser(admin, user.id)
    return NextResponse.json({
      status: result.paid > 0 ? 'paid' : 'pending',
      synced: result.synced,
      paid: result.paid,
      errors: result.errors,
    })
  }

  if (paymentIntentId) {
    const { data: paymentRow } = await supabase
      .from('saas_payments')
      .select('order_number')
      .eq('payment_intent_id', paymentIntentId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!paymentRow) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
    }

    const result = await syncSaasPaymentByPaymentIntentId(admin, paymentIntentId)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    return NextResponse.json({ status: result.status })
  }

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

  const { data: paymentRow } = await supabase
    .from('saas_payments')
    .select('order_number')
    .eq('order_number', orderNumber)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!paymentRow) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  const result = await syncSaasPaymentByOrderNumber(admin, orderNumber)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ status: result.status })
}
