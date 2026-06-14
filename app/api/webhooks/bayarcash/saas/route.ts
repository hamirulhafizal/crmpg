import { NextResponse } from 'next/server'
import { sanitizeCrmOrderNumber } from '@/app/lib/google-ads/sanitize-order-number'
import { syncSaasPaymentByOrderNumber } from '@/app/lib/saas/sync-bayarcash-payment'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

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
    const admin = createServiceRoleClient()
    await syncSaasPaymentByOrderNumber(admin, clean)
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
    const admin = createServiceRoleClient()
    await syncSaasPaymentByOrderNumber(admin, orderNumber)
  } catch (e) {
    console.error('bayarcash saas webhook GET', e)
  }
  return NextResponse.json({ ok: true })
}
