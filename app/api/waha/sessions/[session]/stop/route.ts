import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// POST /api/waha/sessions/[session]/stop - Stop a session
export async function POST(
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

    const result = await wahaFetch<{ name: string; status: string }>(
      `/api/sessions/${encodeURIComponent(session)}/stop`,
      { method: 'POST' }
    )
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to stop session'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
