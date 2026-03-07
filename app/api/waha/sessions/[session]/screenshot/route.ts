import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, getWahaConfig } from '@/app/lib/waha'

// GET /api/waha/sessions/[session]/screenshot - Proxy WAHA screenshot (keeps API key server-side)
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

    const { baseUrl, apiKey } = getWahaConfig()
    const url = `${baseUrl}/api/screenshot?session=${encodeURIComponent(session)}`
    const res = await fetch(url, {
      headers: { 'X-Api-Key': apiKey, Accept: 'image/png' },
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: text || `Screenshot failed ${res.status}` },
        { status: res.status }
      )
    }

    const contentType = res.headers.get('content-type') || 'image/png'
    const buffer = await res.arrayBuffer()
    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get screenshot'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
