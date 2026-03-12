import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// GET /api/waha/sessions/[session] - Get session status
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured' },
        { status: 503 }
      )
    }

    const { session } = await params
    if (!session) {
      return NextResponse.json({ error: 'Session name required' }, { status: 400 })
    }

    const result = await wahaFetch<{
      name: string
      status: string
      me?: { id?: string; pushName?: string } | null
      engine?: { engine?: string }
      config?: unknown
    }>(`/api/sessions/${encodeURIComponent(session)}`)
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE /api/waha/sessions/[session] - Delete a session
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isWahaConfigured()) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured' },
        { status: 503 }
      )
    }

    const { session } = await params
    if (!session) {
      return NextResponse.json({ error: 'Session name required' }, { status: 400 })
    }

    // Ensure this session belongs to the current user
    const { data: mapping, error: mapError } = await supabase
      .from('waha_user_sessions')
      .select('session_name')
      .eq('user_id', user.id)
      .eq('session_name', session)
      .maybeSingle()

    if (mapError) {
      return NextResponse.json(
        { error: 'Failed to verify session owner' },
        { status: 500 }
      )
    }

    if (!mapping) {
      return NextResponse.json(
        { error: 'Session not found for this user' },
        { status: 404 }
      )
    }

    // Best-effort: tell WAHA backend to delete the session, but
    // don't block UI cleanup if that fails.
    try {
      await wahaFetch<unknown>(
        `/api/sessions/${encodeURIComponent(session)}`,
        { method: 'DELETE' }
      )
    } catch (err) {
      console.error('Failed to delete WAHA backend session, continuing with local cleanup:', err)
    }

    // Remove mapping record so it disappears from UI, even if WAHA call failed
    await supabase
      .from('waha_user_sessions')
      .delete()
      .eq('user_id', user.id)
      .eq('session_name', session)

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
