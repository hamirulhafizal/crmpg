import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sanitizeNextPath, sealIosHandoff } from '@/app/lib/auth/ios-handoff'

type Body = {
  next?: string
  refreshToken?: string
  accessToken?: string
}

/**
 * POST /api/auth/ios-handoff
 * Bearer access token + refresh token → short-lived Safari handoff URL that sets web cookies.
 */
export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') ?? ''
    const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() ?? ''
    const body = (await request.json().catch(() => ({}))) as Body

    const accessToken = (body.accessToken?.trim() || bearer).trim()
    const refreshToken = body.refreshToken?.trim() ?? ''
    const next = sanitizeNextPath(body.next)

    if (!accessToken || !refreshToken) {
      return NextResponse.json(
        { error: 'accessToken and refreshToken are required' },
        { status: 400 }
      )
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !anonKey) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 500 })
    }

    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await supabase.auth.getUser(accessToken)
    if (error || !data.user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    const code = sealIosHandoff({ accessToken, refreshToken, next })
    const origin = new URL(request.url).origin
    const handoffUrl = `${origin}/auth/ios-handoff?code=${encodeURIComponent(code)}`

    return NextResponse.json({
      url: handoffUrl,
      expiresInSeconds: 90,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Handoff failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
