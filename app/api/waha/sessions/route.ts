import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// GET /api/waha/sessions - List WAHA sessions for the current user only
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured (WAHA_API_BASE_URL / WAHA_API_KEY)' },
        { status: 503 }
      )
    }

    const { data: userSessions, error: fetchError } = await supabase
      .from('waha_user_sessions')
      .select('session_name')
      .eq('user_id', user.id)

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to load your sessions' },
        { status: 500 }
      )
    }

    const allowedNames = (userSessions || []).map((r) => r.session_name)
    if (allowedNames.length === 0) {
      return NextResponse.json({ sessions: [] })
    }

    const allSessions = await wahaFetch<Array<{
      name: string
      status: string
      me?: { id?: string; pushName?: string } | null
      engine?: { engine?: string }
      config?: unknown
    }>>('/api/sessions?all=true')

    const sessions = allSessions.filter((s) => allowedNames.includes(s.name))
    return NextResponse.json({ sessions })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to list sessions'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/waha/sessions - Create a session (name = user phone e.g. 60184644305)
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured (WAHA_API_BASE_URL / WAHA_API_KEY)' },
        { status: 503 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const name = (body.name || '').toString().trim()
    const start = body.start !== false
    const config = body.config || {}

    if (!name) {
      return NextResponse.json(
        { error: 'Session name is required (e.g. your phone: 60184644305)' },
        { status: 400 }
      )
    }

    // Normalize session name: digits only, ensure 60 prefix for MY
    let sessionName = name.replace(/\D/g, '')
    if (sessionName.startsWith('0')) {
      sessionName = '60' + sessionName.slice(1)
    } else if (!sessionName.startsWith('60')) {
      sessionName = '60' + sessionName
    }

    const result = await wahaFetch<{
      name: string
      status: string
      me?: unknown
      engine?: { engine?: string }
      config?: unknown
    }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({
        name: sessionName,
        start,
        config,
      }),
    })

    await supabase
      .from('waha_user_sessions')
      .upsert(
        {
          user_id: user.id,
          session_name: result.name || sessionName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,session_name' }
      )

    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
