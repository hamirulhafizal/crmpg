import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { verifyOtpForCustomer } from '@/app/lib/customer-portal/otp'
import {
  createCustomerPortalToken,
  portalSessionCookieOptions,
} from '@/app/lib/customer-portal/session'
import { CUSTOMER_PORTAL_COOKIE, SESSION_TTL_MS } from '@/app/lib/customer-portal/constants'
import { getAuthenticatedPortalCustomer, portalCustomerPublicView } from '@/app/lib/customer-portal/auth'

type Body = {
  customer_id?: string
  code?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Body
    const customerId = (body.customer_id || '').trim()
    const code = (body.code || '').trim()

    if (!customerId || !code) {
      return NextResponse.json({ error: 'customer_id and code are required' }, { status: 400 })
    }

    const result = await verifyOtpForCustomer(customerId, code)
    if (!result.ok) {
      const messages = {
        invalid: 'Invalid code. Please try again.',
        expired: 'This code has expired. Request a new one.',
        locked: 'Too many failed attempts. Request a new code.',
      }
      const status = result.reason === 'locked' ? 429 : 401
      return NextResponse.json({ error: messages[result.reason] }, { status })
    }

    const token = createCustomerPortalToken(customerId)
    const jar = await cookies()
    jar.set(
      CUSTOMER_PORTAL_COOKIE,
      token,
      portalSessionCookieOptions(Math.floor(SESSION_TTL_MS / 1000))
    )

    const customer = await getAuthenticatedPortalCustomer()
    if (!customer) {
      return NextResponse.json({ error: 'Session could not be established' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      customer: portalCustomerPublicView(customer),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Verification failed'
    console.error('customer-portal/verify-otp:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
