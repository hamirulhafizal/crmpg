import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { syncSaasMandateByOrderNumber } from '@/app/lib/saas/sync-bayarcash-mandate'
import { syncSaasPaymentByOrderNumber } from '@/app/lib/saas/sync-bayarcash-payment'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

async function syncByOrderNumber(orderNumber: string) {
  const admin = createServiceRoleClient()
  if (orderNumber.startsWith('SADD-')) {
    const result = await syncSaasMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      console.error('bayarcash saas mandate webhook sync error', orderNumber, result.message)
    }
    return
  }
  const { data: pay } = await admin
    .from('saas_payments')
    .select('mandate_id')
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (pay?.mandate_id) {
    const result = await syncSaasMandateByOrderNumber(admin, orderNumber)
    if (result.status === 'error') {
      console.error('bayarcash saas mandate webhook sync error', orderNumber, result.message)
    }
    return
  }
  const result = await syncSaasPaymentByOrderNumber(admin, orderNumber)
  if (result.status === 'error') {
    console.error('bayarcash saas webhook sync error', orderNumber, result.message)
  }
}

export async function POST(request: Request) {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: true, ignored: true })
  }

  const orderNumber =
    (typeof body.order_number === 'string' && body.order_number) ||
    (typeof body.orderNumber === 'string' && body.orderNumber) ||
    (typeof (body as { data?: { order_number?: string } }).data?.order_number === 'string' &&
      (body as { data: { order_number: string } }).data.order_number) ||
    ''

  const clean = sanitizeCrmOrderNumber(orderNumber)
  if (!clean) {
    return NextResponse.json({ ok: true })
  }

  try {
    await syncByOrderNumber(clean)
  } catch (e) {
    console.error('bayarcash saas webhook', e)
  }

  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const orderNumber = sanitizeCrmOrderNumber(
    url.searchParams.get('order_number') || url.searchParams.get('orderNumber')
  )
  if (!orderNumber) {
    return NextResponse.json({ ok: true })
  }
  try {
    await syncByOrderNumber(orderNumber)
  } catch (e) {
    console.error('bayarcash saas webhook GET', e)
  }
  return NextResponse.json({ ok: true })
}
