import { NextResponse } from 'next/server'
import { pgSyncWebhookSecret } from '@/app/lib/pg-sync/config'

export const dynamic = 'force-dynamic'

/**
 * Receives real-time events from the PG Sync worker (see CRMPG Sync API Swagger).
 * UI primarily polls GET /api/pg-sync/jobs/{id}; this endpoint is for worker delivery + logging.
 */
export async function POST(request: Request) {
  const secret = pgSyncWebhookSecret()
  if (secret) {
    const auth = request.headers.get('authorization')
    const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    const headerSecret = request.headers.get('x-pg-sync-secret')
    if (bearer !== secret && headerSecret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event =
    payload && typeof payload === 'object' && 'event' in payload
      ? String((payload as { event: unknown }).event)
      : 'unknown'

  console.log('[pg-sync/webhook]', event, JSON.stringify(payload).slice(0, 2000))

  return NextResponse.json({ ok: true, received: event })
}
