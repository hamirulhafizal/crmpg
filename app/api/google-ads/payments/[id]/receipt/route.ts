import { NextResponse } from 'next/server'
import { renderGoogleAdsPaymentReceiptPdf } from '@/app/lib/google-ads/render-payment-receipt-pdf'
import { createClient } from '@/app/lib/supabase/server'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function safeFilename(orderNumber: string): string {
  const safe = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)
  return safe || 'receipt'
}

/** PDF receipt for a paid Google Ads payment (participant only). */
export async function GET(_request: Request, props: RouteParams) {
  const { id } = await props.params
  if (!id) {
    return NextResponse.json({ error: 'Missing payment id' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: participant, error: pErr } = await supabase
    .from('google_ads_participants')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!participant) {
    return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
  }

  const { data: payment, error: payErr } = await supabase
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
      updated_at,
      created_at,
      package:google_ads_packages!package_id (
        name
      )
    `
    )
    .eq('id', id)
    .eq('participant_id', participant.id)
    .maybeSingle()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  }
  if (payment.status !== 'paid') {
    return NextResponse.json({ error: 'Receipt is only available for paid payments' }, { status: 400 })
  }

  const pkg = payment.package as { name?: string } | { name?: string }[] | null
  const pkgName = Array.isArray(pkg) ? pkg[0]?.name : pkg?.name

  const receiptLine =
    payment.receipt_label ||
    [payment.exchange_reference_number, payment.bayarcash_transaction_id].filter(Boolean).join(' · ') ||
    null

  const pdf = await renderGoogleAdsPaymentReceiptPdf({
    orderNumber: payment.order_number,
    amount: Number(payment.amount),
    currency: payment.currency || 'MYR',
    paidAt: payment.updated_at || payment.created_at,
    packageName: pkgName ?? null,
    receiptLine,
    exchangeReferenceNumber: payment.exchange_reference_number,
    transactionId: payment.bayarcash_transaction_id,
  })

  const name = safeFilename(payment.order_number)

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Receipt-${name}.pdf"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
