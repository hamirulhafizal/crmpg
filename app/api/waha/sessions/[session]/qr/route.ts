import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { isWahaConfigured, wahaFetch } from '@/app/lib/waha'

// GET /api/waha/sessions/[session]/qr - Get QR code for pairing (base64 image or raw value)
export async function GET(
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

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'image' // image | raw

    const result = await wahaFetch<{ data?: string; value?: string }>(
      `/api/${encodeURIComponent(session)}/auth/qr?format=${format === 'raw' ? 'raw' : 'image'}`,
      { headers: { Accept: 'application/json' } },
      { userId: user.id }
    )

    if (format === 'raw' && result?.value) {
      return NextResponse.json({ value: result.value })
    }
    if (result?.data) {
      return NextResponse.json({ qrcode: result.data, mimetype: 'image/png' })
    }
    return NextResponse.json({ error: 'No QR data' }, { status: 404 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get QR'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
