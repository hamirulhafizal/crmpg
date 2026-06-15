import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { CUSTOMER_PORTAL_COOKIE } from '@/app/lib/customer-portal/constants'
import { createClient } from '@/app/lib/supabase/server'

const EXTRA_COOKIE_NAMES = [
  CUSTOMER_PORTAL_COOKIE,
  'google_contacts_access_token',
  'google_contacts_refresh_token',
] as const

async function clearAllServerCookies(): Promise<void> {
  const jar = await cookies()

  const names = new Set<string>(EXTRA_COOKIE_NAMES)
  for (const cookie of jar.getAll()) {
    names.add(cookie.name)
  }

  for (const name of names) {
    jar.set(name, '', {
      path: '/',
      maxAge: 0,
      expires: new Date(0),
    })
  }
}

async function performServerLogout(): Promise<void> {
  const supabase = await createClient()
  try {
    await supabase.auth.signOut({ scope: 'global' })
  } catch {
    // Still clear cookies if Supabase call fails (e.g. session already gone).
  }
  await clearAllServerCookies()
}

/** POST — clear Supabase session + all auth cookies (called from /logout page). */
export async function POST(request: Request) {
  try {
    let localOnly = false
    try {
      const body = (await request.json()) as { localOnly?: boolean }
      localOnly = body.localOnly === true
    } catch {
      // Empty body — full logout.
    }

    if (localOnly) {
      await clearAllServerCookies()
      return NextResponse.json({ success: true })
    }

    await performServerLogout()
    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Logout failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** GET — server logout then redirect to /login (bookmarkable logout URL). */
export async function GET(request: Request) {
  try {
    await performServerLogout()
  } catch {
    // Continue to login even if server cleanup fails; client page also clears storage.
  }

  const url = new URL('/login', request.url)
  url.searchParams.set('logged_out', '1')
  return NextResponse.redirect(url)
}
