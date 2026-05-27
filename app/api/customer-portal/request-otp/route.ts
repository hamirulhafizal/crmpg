import { NextResponse } from 'next/server'
import { lookupCustomerByPgCode, normalizePgCodeInput } from '@/app/lib/customer-portal/lookup'
import {
  PORTAL_AMBIGUOUS,
  PORTAL_GENERIC_NOT_FOUND,
  PORTAL_NO_CONTACT,
  PORTAL_RATE_LIMIT,
} from '@/app/lib/customer-portal/messages'
import {
  countRecentOtpSends,
  createOtpRecord,
  generateOtpCode,
  isOtpRateLimited,
} from '@/app/lib/customer-portal/otp'
import { deliverCustomerPortalTac } from '@/app/lib/customer-portal/send-tac'

type Body = {
  pg_code?: string
  /** @deprecated use pg_code */
  identifier?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body
    const pgCodeRaw = (body.pg_code || body.identifier || '').trim()

    if (!pgCodeRaw) {
      return NextResponse.json({ error: 'PG code is required' }, { status: 400 })
    }

    const lookup = await lookupCustomerByPgCode(pgCodeRaw)

    if (!lookup.ok) {
      if (lookup.reason === 'ambiguous') {
        return NextResponse.json({ error: PORTAL_AMBIGUOUS }, { status: 409 })
      }
      return NextResponse.json({ error: PORTAL_GENERIC_NOT_FOUND }, { status: 404 })
    }

    const customer = lookup.customer
    if (!customer.phone?.trim() && !customer.email?.trim()) {
      return NextResponse.json({ error: PORTAL_NO_CONTACT }, { status: 400 })
    }

    const identifierNormalized = `pg:${normalizePgCodeInput(pgCodeRaw).toLowerCase()}`

    const recentSends = await countRecentOtpSends(identifierNormalized)
    if (isOtpRateLimited(recentSends)) {
      return NextResponse.json({ error: PORTAL_RATE_LIMIT }, { status: 429 })
    }

    const code = generateOtpCode()
    await createOtpRecord({
      customerId: customer.id,
      code,
      identifierKind: 'pg_code',
      identifierNormalized,
    })

    const sent = await deliverCustomerPortalTac({
      ownerUserId: customer.user_id,
      customerPhone: customer.phone,
      customerEmail: customer.email,
      code,
      pgCode: customer.pg_code,
    })

    if (!sent.ok) {
      return NextResponse.json({ error: sent.error }, { status: 503 })
    }

    const channelLabel = sent.channel === 'whatsapp' ? 'WhatsApp' : 'email'
    return NextResponse.json({
      success: true,
      customer_id: customer.id,
      channel: sent.channel,
      masked_destination: sent.maskedDestination,
      message: `Verification code sent to ${channelLabel} ${sent.maskedDestination}.`,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send verification code'
    console.error('customer-portal/request-otp:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
