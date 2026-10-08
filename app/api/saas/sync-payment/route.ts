import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { syncSaasMandateByOrderNumber } from '@/app/lib/saas/sync-bayarcash-mandate'
import {
  syncPendingSaasPaymentsForUser,
  syncSaasPaymentByOrderNumber,
  syncSaasPaymentByPaymentIntentId,
} from '@/app/lib/saas/sync-bayarcash-payment'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user } = auth

  const url = new URL(request.url)
  const syncAllPending = url.searchParams.get('sync_pending') === '1'
  const paymentIntentId = (url.searchParams.get('payment_intent_id') || '').trim()

  const admin = createServiceRoleClient()

  if (syncAllPending) {
    const result = await syncPendingSaasPaymentsForUser(admin, user.id)
    // Also reconcile pending Direct Debit enrollments
    const { data: pendingMandates } = await admin
      .from('saas_mandates')
      .select('order_number')
      .eq('user_id', user.id)
      .eq('status', 'pending_enrollment')
    let mandatePaid = 0
    for (const m of pendingMandates ?? []) {
      const r = await syncSaasMandateByOrderNumber(admin, m.order_number)
      if (r.status === 'active') mandatePaid += 1
    }
    return NextResponse.json({
      status: result.paid > 0 || mandatePaid > 0 ? 'paid' : 'pending',
      synced: result.synced + (pendingMandates?.length ?? 0),
      paid: result.paid + mandatePaid,
      errors: result.errors,
    })
  }

  if (paymentIntentId) {
    const { data: paymentRow } = await admin
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
    return NextResponse.json({ status: result.status, method: 'fpx' })
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

  if (orderNumber.startsWith('SADD-')) {
    const { data: mandateRow } = await admin
      .from('saas_mandates')
      .select('order_number')
      .eq('order_number', orderNumber)
      .eq('user_id', user.id)
      .maybeSingle()

    if (!mandateRow) {
      return NextResponse.json({ error: 'Mandate not found' }, { status: 404 })
    }

    const result = await syncSaasMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    if (result.status === 'active') return NextResponse.json({ status: 'paid', method: 'direct_debit' })
    if (result.status === 'failed') return NextResponse.json({ status: 'failed', method: 'direct_debit' })
    return NextResponse.json({ status: 'pending', method: 'direct_debit' })
  }

  const { data: paymentRow } = await admin
    .from('saas_payments')
    .select('order_number, mandate_id')
    .eq('order_number', orderNumber)
    .eq('user_id', user.id)
    .maybeSingle()

  if (!paymentRow) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }

  if (paymentRow.mandate_id) {
    const result = await syncSaasMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      return NextResponse.json({ error: result.message }, { status: 400 })
    }
    if (result.status === 'active') return NextResponse.json({ status: 'paid', method: 'direct_debit' })
    if (result.status === 'failed') return NextResponse.json({ status: 'failed', method: 'direct_debit' })
    return NextResponse.json({ status: 'pending', method: 'direct_debit' })
  }

  const result = await syncSaasPaymentByOrderNumber(admin, orderNumber)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json({ status: result.status, method: 'fpx' })
}
