import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// POST /api/waha/sessions/[session]/request-code - Request pairing code (WAHA)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isWahaConfigured({ userId: user.id }))) {
      return NextResponse.json(
        { error: 'WAHA integration is not configured' },
        { status: 503 }
      )
    }

    const { session } = await params
    if (!session) {
      return NextResponse.json({ error: 'Session name required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const result = await wahaFetch<{ code?: string }>(
      `/api/${encodeURIComponent(session)}/auth/request-code`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
      { userId: user.id }
    )
    return NextResponse.json(result)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to request code'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
