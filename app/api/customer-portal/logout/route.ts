import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CUSTOMER_PORTAL_COOKIE } from '@/app/lib/customer-portal/constants'

export async function POST() {
  const jar = await cookies()
  jar.set(CUSTOMER_PORTAL_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return NextResponse.json({ success: true })
}
