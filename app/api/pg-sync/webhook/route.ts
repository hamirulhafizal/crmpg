import { NextResponse } from 'next/server'
import { pgSyncWebhookSecret } from '@/app/lib/pg-sync/config'
import { applyPgSyncWebhook, type PgSyncWebhookPayload } from '@/app/lib/pg-sync/jobs-db'

export const dynamic = 'force-dynamic'

/**
 * Receives real-time events from the PG Sync worker (see CRMPG Sync API Swagger).
 * Updates durable job rows in Supabase; UI still polls GET /api/pg-sync/jobs/{id}.
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

  let payload: PgSyncWebhookPayload
  try {
    payload = (await request.json()) as PgSyncWebhookPayload
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const event = payload.event?.trim() ?? 'unknown'

  console.log('[pg-sync/webhook]', event, JSON.stringify(payload).slice(0, 2000))

  const updated = await applyPgSyncWebhook(payload)

  return NextResponse.json({ ok: true, received: event, persisted: updated })
}
