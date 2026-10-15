import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

/**
 * Email OTP / recovery confirmation (token_hash).
 * Avoids PKCE code_verifier — works when the reset link is opened on any device.
 * See https://supabase.com/docs/guides/auth/auth-password-reset
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextRaw = searchParams.get('next') ?? '/reset-password'
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/reset-password'

  const fail = (message: string) => {
    const url = new URL('/forgot-password', origin)
    url.searchParams.set('error', message)
    return NextResponse.redirect(url)
  }

  if (!token_hash || !type) {
    return fail('Reset link is missing token. Request a new password reset email.')
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ type, token_hash })

  if (error) {
    console.error('auth/confirm verifyOtp failed:', error.message)
    return fail(
      error.message || 'Reset link is invalid or expired. Request a new password reset email.'
    )
  }

  // Recovery session cookies are set — send user to set a new password.
  return NextResponse.redirect(new URL(next, origin))
}
