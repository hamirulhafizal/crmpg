import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/app/lib/supabase/server'
import { sanitizeNextPath, unsealIosHandoff } from '@/app/lib/auth/ios-handoff'

function loginRedirect(origin: string, next: string, reason: string) {
  const url = new URL('/login', origin)
  url.searchParams.set('next', next)
  url.searchParams.set('ios_handoff', reason)
  return NextResponse.redirect(url)
}

/**
 * GET /auth/ios-handoff?code=…
 * Consumes a one-time sealed code from the iOS app, sets Supabase cookies, redirects to `next`.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')?.trim() ?? ''
  const fallbackNext = sanitizeNextPath(requestUrl.searchParams.get('next'))

  if (!code) {
    return loginRedirect(requestUrl.origin, fallbackNext, 'missing_code')
  }

  try {
    const payload = unsealIosHandoff(code)
    const supabase = await createClient()

    const { data, error } = await supabase.auth.setSession({
      access_token: payload.accessToken,
      refresh_token: payload.refreshToken,
    })

    if (error || !data.session) {
      return loginRedirect(requestUrl.origin, payload.next, 'session_failed')
    }

    // Touch cookie jar so SSR middleware sees the new session on the next hop.
    await cookies()

    return NextResponse.redirect(new URL(payload.next, requestUrl.origin))
  } catch {
    return loginRedirect(requestUrl.origin, fallbackNext, 'invalid_or_expired')
  }
}
