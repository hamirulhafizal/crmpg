import {
  getBayarcashApiBase,
  getBayarcashPat,
  getBayarcashPaymentChannel,
  getBayarcashPortalKey,
  myrToBayarcashPaymentIntentAmount,
} from '@/app/lib/bayarcash/config'

export type CreatePaymentIntentParams = {
  orderNumber: string
  amountMyr: number
  payerName: string
  payerEmail: string
  payerPhone?: string | null
  returnUrl: string
  callbackUrl: string
  metadata?: string
}

export type CreatePaymentIntentSuccess = {
  id: string
  url: string
  amount?: string
  orderNumber?: string
}

/**
 * POST /v3/payment-intents — see Bayarcash docs.
 */
export async function createPaymentIntent(
  params: CreatePaymentIntentParams
): Promise<{ ok: true; data: CreatePaymentIntentSuccess } | { ok: false; error: string; status?: number; body?: string }> {
  const pat = getBayarcashPat()
  const portalKey = getBayarcashPortalKey()
  if (!pat) return { ok: false, error: 'BAYARCASH_PAT is not configured' }
  if (!portalKey) return { ok: false, error: 'BAYARCASH_PORTAL_KEY is not configured' }

  const base = getBayarcashApiBase()
  const amount = myrToBayarcashPaymentIntentAmount(params.amountMyr)
  if (amount <= 0) return { ok: false, error: 'Invalid amount' }

  const phoneDigits = (params.payerPhone || '')
    .replace(/\D/g, '')
    .slice(0, 15)
  const phoneInt = phoneDigits.length > 0 ? parseInt(phoneDigits, 10) : undefined

  const body: Record<string, unknown> = {
    payment_channel: getBayarcashPaymentChannel(),
    portal_key: portalKey,
    order_number: params.orderNumber,
    amount,
    payer_name: params.payerName.trim(),
    payer_email: params.payerEmail.trim(),
    return_url: params.returnUrl,
    callback_url: params.callbackUrl,
  }
  if (phoneInt !== undefined && !Number.isNaN(phoneInt)) {
    body.payer_telephone_number = phoneInt
  }
  if (params.metadata) {
    body.metadata = params.metadata
  }

  const url = `${base}/payment-intents`
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${pat}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }

  const text = await res.text()
  if (!res.ok) {
    return { ok: false, error: `Bayarcash error (${res.status})`, status: res.status, body: text.slice(0, 500) }
  }

  let json: Record<string, unknown>
  try {
    json = JSON.parse(text) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'Invalid JSON from Bayarcash' }
  }

  const id = (json.id as string) || ''
  const payUrl = (json.url as string) || ''
  if (!id || !payUrl) {
    return { ok: false, error: 'Bayarcash response missing id or url', body: text.slice(0, 500) }
  }

  return {
    ok: true,
    data: {
      id,
      url: payUrl,
      amount: json.amount as string | undefined,
      orderNumber: json.order_number as string | undefined,
    },
  }
}

export type PaymentIntentStatusResponse = {
  type?: string
  id: string
  status?: string
  order_number?: string
  amount?: string
  currency?: string
  paid_at?: string | null
  last_attempt?: string
  attempts?: Array<{
    transaction_id?: string
    exchange_reference_number?: string
    exchange_transaction_id?: string
    status?: number
    status_description?: string
  }>
}

export async function getPaymentIntentById(
  paymentIntentId: string
): Promise<{ ok: true; data: PaymentIntentStatusResponse } | { ok: false; error: string; status?: number }> {
  const pat = getBayarcashPat()
  if (!pat) return { ok: false, error: 'BAYARCASH_PAT is not configured' }

  const base = getBayarcashApiBase()
  const url = `${base}/payment-intents/${encodeURIComponent(paymentIntentId)}`

  let res: Response
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${pat}`,
      },
      cache: 'no-store',
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' }
  }

  const text = await res.text()
  if (!res.ok) {
    return { ok: false, error: `Bayarcash ${res.status}`, status: res.status }
  }

  try {
    const data = JSON.parse(text) as PaymentIntentStatusResponse
    return { ok: true, data: { ...data, id: data.id || paymentIntentId } }
  } catch {
    return { ok: false, error: 'Invalid JSON from Bayarcash' }
  }
}
