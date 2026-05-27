import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import {
  CUSTOMER_PORTAL_COOKIE,
  SESSION_TTL_MS,
} from '@/app/lib/customer-portal/constants'

type SessionPayload = {
  cid: string
  exp: number
}

function getSessionSecret(): string {
  const secret =
    process.env.CUSTOMER_PORTAL_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ''
  if (!secret) {
    throw new Error('CUSTOMER_PORTAL_SECRET or CRON_SECRET must be set for customer portal')
  }
  return secret
}

function signPayload(encoded: string): string {
  return createHmac('sha256', getSessionSecret()).update(encoded).digest('base64url')
}

export function createCustomerPortalToken(customerId: string): string {
  const payload: SessionPayload = {
    cid: customerId,
    exp: Date.now() + SESSION_TTL_MS,
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = signPayload(encoded)
  return `${encoded}.${sig}`
}

function parseToken(token: string): SessionPayload | null {
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, sig] = parts
  if (!encoded || !sig) return null

  const expected = signPayload(encoded)
  try {
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  } catch {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionPayload
    if (!payload?.cid || typeof payload.exp !== 'number') return null
    if (payload.exp < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

export async function getCustomerIdFromPortalCookie(): Promise<string | null> {
  const jar = await cookies()
  const token = jar.get(CUSTOMER_PORTAL_COOKIE)?.value
  if (!token) return null
  const payload = parseToken(token)
  return payload?.cid ?? null
}

export function portalSessionCookieOptions(maxAgeSec: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: maxAgeSec,
  }
}
