import {
  getBayarcashApiBase,
  getBayarcashPat,
  getBayarcashPortalKey,
  getBayarcashSecret,
} from '@/app/lib/bayarcash/config'
import { createFpxDirectDebitEnrolmentChecksum } from '@/app/lib/bayarcash/checksum'

export type CreateMandateEnrollmentParams = {
  orderNumber: string
  amountMyr: number
  payerName: string
  payerEmail: string
  payerPhone: string
  /** NRIC / IC number (digits). */
  payerId: string
  payerIdType?: number
  applicationReason: string
  frequencyMode: 'MT' | 'YR'
  effectiveDate?: string
  expiryDate?: string
  returnUrl: string
  successUrl?: string
  failedUrl?: string
  metadata?: string
}

export type CreateMandateEnrollmentSuccess = {
  url: string
  orderNumber?: string
  amount?: string | number
  raw: Record<string, unknown>
}

function formatAmountMyr(myr: number): string {
  return Number(myr).toFixed(2)
}

/**
 * Bayarcash e-Mandate checksum is verified after the gateway normalises MSISDN.
 * Local `01xxxxxxxx` must be signed/sent as-is — converting to `60…` causes checksum mismatch.
 */
function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('60') && digits.length >= 11) {
    digits = `0${digits.slice(2)}`
  } else if (!digits.startsWith('0') && digits.length >= 9 && digits.length <= 11) {
    digits = `0${digits}`
  }
  return digits.slice(0, 15)
}

/** Bayarcash payer_email max length is 27. */
function truncateEmail(email: string): string {
  return email.trim().slice(0, 27)
}

/**
 * POST /v3/mandates — FPX Direct Debit e-Mandate enrollment.
 */
export async function createMandateEnrollment(
  params: CreateMandateEnrollmentParams
): Promise<
  | { ok: true; data: CreateMandateEnrollmentSuccess }
  | { ok: false; error: string; status?: number; body?: string }
> {
  const pat = getBayarcashPat()
  const portalKey = getBayarcashPortalKey()
  const secret = getBayarcashSecret()
  if (!pat) return { ok: false, error: 'BAYARCASH_PAT is not configured' }
  if (!portalKey) return { ok: false, error: 'BAYARCASH_PORTAL_KEY is not configured' }
  if (!secret) return { ok: false, error: 'BAYARCASH_SECRET is not configured' }

  const amount = formatAmountMyr(params.amountMyr)
  const amountNum = Number(amount)
  if (!Number.isFinite(amountNum) || amountNum < 5 || amountNum > 30000) {
    return { ok: false, error: 'Amount must be between RM 5.00 and RM 30,000.00 for Direct Debit' }
  }

  const payerId = params.payerId.replace(/\D/g, '')
  if (payerId.length < 6) {
    return { ok: false, error: 'Invalid NRIC / IC number' }
  }

  const phone = normalizePhone(params.payerPhone)
  if (phone.length < 9) {
    return { ok: false, error: 'Valid phone number is required for Direct Debit' }
  }

  const payerName = params.payerName.trim()
  const payerEmail = truncateEmail(params.payerEmail)
  const payerIdType = params.payerIdType ?? 1
  const frequencyMode = params.frequencyMode
  const applicationReason = params.applicationReason.trim().slice(0, 200)

  const checksum = createFpxDirectDebitEnrolmentChecksum(secret, {
    order_number: params.orderNumber,
    amount,
    payer_name: payerName,
    payer_email: payerEmail,
    payer_telephone_number: phone,
    payer_id_type: payerIdType,
    payer_id: payerId,
    application_reason: applicationReason,
    frequency_mode: frequencyMode,
  })

  const body: Record<string, unknown> = {
    portal_key: portalKey,
    order_number: params.orderNumber,
    amount,
    payer_id_type: payerIdType,
    payer_id: payerId,
    payer_name: payerName,
    payer_email: payerEmail,
    payer_telephone_number: phone,
    frequency_mode: frequencyMode,
    application_reason: applicationReason,
    return_url: params.returnUrl,
    checksum,
  }

  if (params.effectiveDate) body.effective_date = params.effectiveDate
  if (params.expiryDate) body.expiry_date = params.expiryDate
  if (params.successUrl) body.success_url = params.successUrl
  if (params.failedUrl) body.failed_url = params.failedUrl
  if (params.metadata) body.metadata = params.metadata

  const url = `${getBayarcashApiBase()}/mandates`
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

  const enrollUrl = typeof json.url === 'string' ? json.url : ''
  if (!enrollUrl) {
    return { ok: false, error: 'Bayarcash response missing enrollment url', body: text.slice(0, 500) }
  }

  return {
    ok: true,
    data: {
      url: enrollUrl,
      orderNumber: typeof json.order_number === 'string' ? json.order_number : undefined,
      amount: json.amount as string | number | undefined,
      raw: json,
    },
  }
}

export type MandateStatusResponse = {
  id?: string
  order_number?: string
  status?: string | number
  status_description?: string
  amount?: string | number
  url?: string
  [key: string]: unknown
}

/** GET /v3/mandates/{id} or list filter by order_number when id unknown. */
export async function getMandateByOrderNumber(
  orderNumber: string
): Promise<{ ok: true; data: MandateStatusResponse } | { ok: false; error: string; status?: number }> {
  const pat = getBayarcashPat()
  if (!pat) return { ok: false, error: 'BAYARCASH_PAT is not configured' }

  const base = getBayarcashApiBase()
  const listUrl = `${base}/mandates?order_number=${encodeURIComponent(orderNumber)}`

  let res: Response
  try {
    res = await fetch(listUrl, {
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
    const parsed = JSON.parse(text) as unknown
    if (Array.isArray(parsed)) {
      const first = parsed[0] as MandateStatusResponse | undefined
      if (!first) return { ok: false, error: 'Mandate not found' }
      return { ok: true, data: first }
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const data = obj.data
      if (Array.isArray(data) && data[0]) {
        return { ok: true, data: data[0] as MandateStatusResponse }
      }
      return { ok: true, data: obj as MandateStatusResponse }
    }
    return { ok: false, error: 'Unexpected mandate response' }
  } catch {
    return { ok: false, error: 'Invalid JSON from Bayarcash' }
  }
}

export function isMandateApprovedStatus(status: string | number | undefined): boolean {
  if (status === undefined || status === null) return false
  if (typeof status === 'number') {
    // Bayarcash FpxDirectDebit: ACTIVE=3, APPROVED=5
    return status === 3 || status === 5
  }
  const s = String(status).toLowerCase()
  return (
    s === 'approved' ||
    s === 'active' ||
    s.includes('approved') ||
    s.includes('active') ||
    s === '3' ||
    s === '5'
  )
}
