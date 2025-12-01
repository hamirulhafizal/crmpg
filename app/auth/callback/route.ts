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
      const errorUrl = new URL('/login', requestUrl.origin)
      errorUrl.searchParams.set('error', exchangeError.message || 'exchange_failed')
      return NextResponse.redirect(errorUrl)
    }

    if (!data.session) {
      console.error('No session created after code exchange')
      const errorUrl = new URL('/login', requestUrl.origin)
      errorUrl.searchParams.set('error', 'no_session')
      errorUrl.searchParams.set('error_description', 'Failed to create session')
      return NextResponse.redirect(errorUrl)
    }

    // Success - redirect to dashboard
    return NextResponse.redirect(new URL(next, requestUrl.origin))
  } catch (err: any) {
    console.error('Unexpected error in auth callback:', err)
    const errorUrl = new URL('/login', requestUrl.origin)
    errorUrl.searchParams.set('error', 'internal_error')
    errorUrl.searchParams.set('error_description', err.message || 'An unexpected error occurred')
    return NextResponse.redirect(errorUrl)
  }
}

