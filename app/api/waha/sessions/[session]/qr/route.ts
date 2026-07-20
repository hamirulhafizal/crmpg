import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { isWhatsAppConfigured } from '@/app/lib/whatsapp/resolve'
import { getWhatsAppSessionQr } from '@/app/lib/whatsapp/sessions'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ session: string }> }
) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user } = auth
    if (!(await isWhatsAppConfigured({ userId: user.id }))) {
      return NextResponse.json({ error: 'WhatsApp integration is not configured' }, { status: 503 })
    }

    const { session } = await params
    if (!session) {
      return NextResponse.json({ error: 'Session name required' }, { status: 400 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') || 'image'
    const forceReconnect = searchParams.get('force') === '1'

    const result = await getWhatsAppSessionQr(user.id, session, { forceReconnect })
    if (result.alreadyConnected) {
      return NextResponse.json({ alreadyConnected: true, message: 'WhatsApp is already linked on this session.' })
    }
    if (format === 'raw' && result.qrString) {
      return NextResponse.json({ value: result.qrString })
    }
    if (result.qrcode) {
      return NextResponse.json({ qrcode: result.qrcode, mimetype: result.mimetype || 'image/png' })
    }
    return NextResponse.json({ error: 'No QR data' }, { status: 404 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to get QR'
    const status = err instanceof WhatsAppApiError ? err.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
