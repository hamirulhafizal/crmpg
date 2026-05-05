import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { renderGoogleAdsPaymentReceiptPdf } from '@/app/lib/google-ads/render-payment-receipt-pdf'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function safeFilename(orderNumber: string): string {
  const safe = orderNumber.replace(/[^a-zA-Z0-9-_]/g, '_').slice(0, 80)
  return safe || 'receipt'
}

/**
 * Admin: PDF receipt for the participant's most recent **paid** Google Ads payment.
 */
export async function GET(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id: participantId } = await props.params
  if (!participantId) {
    return NextResponse.json({ error: 'Missing participant id' }, { status: 400 })
  }

  const admin = createServiceRoleClient()

  const { data: payment, error: payErr } = await admin
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
    .eq('participant_id', participantId)
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })
  if (!payment) {
    return NextResponse.json({ error: 'No paid payment found for this participant' }, { status: 404 })
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
