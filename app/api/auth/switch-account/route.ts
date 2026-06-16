import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/app/lib/supabase/server'

type SwitchAccountBody = {
  userId?: string
  email?: string
  password?: string
  refreshToken?: string
  accessToken?: string
}

async function clearSupabaseAuthCookies(): Promise<void> {
  const jar = await cookies()
  for (const cookie of jar.getAll()) {
    if (cookie.name.startsWith('sb-')) {
      jar.set(cookie.name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
      })
    }
  }
}

/** POST — swap the active Supabase session (sets auth cookies server-side). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SwitchAccountBody
    const userId = body.userId?.trim()
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 })
    }

    const email = body.email?.trim() ?? ''
    const password = body.password?.trim() ?? ''
    const refreshToken = body.refreshToken?.trim() ?? ''
    const accessToken = body.accessToken?.trim() ?? ''

    if (!password && !refreshToken) {
      return NextResponse.json({ error: 'No credentials provided' }, { status: 400 })
    }

    let supabase = await createClient()

    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // Session may already be cleared.
    }
    await clearSupabaseAuthCookies()
    supabase = await createClient()

    let user = null
    let session = null
    let authError: string | null = null

    if (password && email) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      user = data.user
      session = data.session
      authError = error?.message ?? null
    }

    if ((!user || !session) && refreshToken) {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      user = data.user
      session = data.session
      authError = error?.message ?? null

      if ((!user || !session) && refreshToken) {
        const refreshed = await supabase.auth.refreshSession({ refresh_token: refreshToken })
        user = refreshed.data.user
        session = refreshed.data.session
        authError = refreshed.error?.message ?? authError
      }
    }

    if (!user || !session) {
      return NextResponse.json(
        { error: authError ?? 'Could not sign in to the selected account' },
        { status: 401 }
      )
    }

    if (user.id !== userId) {
      return NextResponse.json({ error: 'Signed-in user does not match target account' }, { status: 401 })
    }

    return NextResponse.json({
      success: true,
      userId: user.id,
      email: user.email,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Switch failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
