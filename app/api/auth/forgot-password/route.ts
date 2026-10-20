import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function requestOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const host = (forwardedHost || request.headers.get('host') || '').split(',')[0]?.trim()
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (host.includes('localhost') ? 'http' : 'https')
  if (host) return `${proto}://${host}`
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
}

/**
 * Send a recovery email without PKCE.
 * Browser `resetPasswordForEmail` stores a code_verifier that Gmail (and
 * other devices) do not have, which produces:
 * "both auth code and code verifier should be non-empty".
 */
export async function POST(request: Request) {
  let email = ''
  try {
    const body = (await request.json()) as { email?: string }
    email = String(body.email || '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Auth is not configured' }, { status: 500 })
  }

  const origin = requestOrigin(request)
  const supabase = createClient(url, anonKey, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
