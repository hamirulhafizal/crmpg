import { createClient } from '@/app/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const error = requestUrl.searchParams.get('error')
  const errorDescription = requestUrl.searchParams.get('error_description')
  const next = requestUrl.searchParams.get('next') ?? '/dashboard'

  // Handle OAuth errors
  if (error) {
    console.error('OAuth error:', error, errorDescription)
    const errorUrl = new URL('/login', requestUrl.origin)
    errorUrl.searchParams.set('error', error)
    if (errorDescription) {
      errorUrl.searchParams.set('error_description', errorDescription)
    }
    return NextResponse.redirect(errorUrl)
  }

  if (!code) {
    console.error('No code parameter in callback')
    const errorUrl = new URL('/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'missing_code')
    errorUrl.searchParams.set('error_description', 'No authorization code received')
    return NextResponse.redirect(errorUrl)
  }

  try {
    const supabase = await createClient()
    const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

    if (exchangeError) {
      console.error('Error exchanging code for session:', exchangeError)
      // PKCE recovery often fails when the email is opened without the original
      // browser verifier — send users to request a token_hash reset instead.
      const msg = exchangeError.message || 'exchange_failed'
      const isPkce =
        /code verifier/i.test(msg) || /both auth code and code verifier/i.test(msg)
      const errorUrl = new URL(isPkce ? '/forgot-password' : '/login', requestUrl.origin)
      errorUrl.searchParams.set(
        'error',
        isPkce
          ? 'Reset link needs a new email template (token_hash). Request a new reset link after updating the Supabase Reset password template.'
          : msg
      )
      return NextResponse.redirect(errorUrl)
    }

    if (!data.session) {
      console.error('No session created after code exchange')
      const errorUrl = new URL('/login', requestUrl.origin)
      errorUrl.searchParams.set('error', 'no_session')
      errorUrl.searchParams.set('error_description', 'Failed to create session')
      return NextResponse.redirect(errorUrl)
    }

    // Success — send recovery flows to reset-password; others to next/dashboard
    const safeNext =
      next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
    return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
  } catch (err: unknown) {
    console.error('Unexpected error in auth callback:', err)
    const errorUrl = new URL('/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'internal_error')
    errorUrl.searchParams.set(
      'error_description',
      err instanceof Error ? err.message : 'An unexpected error occurred'
    )
    return NextResponse.redirect(errorUrl)
  }
}

