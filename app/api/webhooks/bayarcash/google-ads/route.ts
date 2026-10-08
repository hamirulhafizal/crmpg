import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { syncGoogleAdsMandateByOrderNumber } from '@/app/lib/google-ads/sync-bayarcash-mandate'
import { syncGoogleAdsPaymentByOrderNumber } from '@/app/lib/google-ads/sync-bayarcash-payment'

async function syncByOrderNumber(orderNumber: string) {
  const admin = createServiceRoleClient()
  if (orderNumber.startsWith('GADD-')) {
    await syncGoogleAdsMandateByOrderNumber(admin, orderNumber)
    return
  }
  const { data: pay } = await admin
    .from('google_ads_payments')
    .select('mandate_id')
    .eq('order_number', orderNumber)
    .maybeSingle()
  if (pay?.mandate_id) {
    await syncGoogleAdsMandateByOrderNumber(admin, orderNumber)
    return
  }
  await syncGoogleAdsPaymentByOrderNumber(admin, orderNumber)
}

/**
 * Bayarcash callback_url — body shape may vary; we resolve by order_number and poll payment-intent / mandate status.
 */
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
    console.error('bayarcash google-ads webhook', e)
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
    console.error('bayarcash google-ads webhook GET', e)
  }
  return NextResponse.json({ ok: true })
}
