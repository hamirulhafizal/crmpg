import { NextResponse } from 'next/server'
import { stampParentPgCodesForUser } from '@/app/lib/customers/stamp-parent-pg-codes'
import { pgSyncWebhookSecret } from '@/app/lib/pg-sync/config'
import {
  applyPgSyncWebhook,
  getPgSyncJobByWorkerId,
  type PgSyncWebhookPayload,
} from '@/app/lib/pg-sync/jobs-db'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const dynamic = 'force-dynamic'

/**
 * Receives real-time events from the PG Sync worker (see CRMPG Sync API Swagger).
 * Updates durable job rows in Supabase; UI still polls GET /api/pg-sync/jobs/{id}.
 * On job.completed, stamps parent_pg_code from BC Parent Name in original_data.
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

  let parentStamp: { scanned: number; updated: number; skipped: number } | null =
    null
  const completed =
    event === 'job.completed' || payload.status?.trim() === 'completed'
  if (updated && completed && payload.job_id) {
    try {
      const job = await getPgSyncJobByWorkerId(payload.job_id.trim())
      if (job?.user_id && job.pg_code) {
        parentStamp = await stampParentPgCodesForUser(
          createServiceRoleClient(),
          job.user_id,
          job.pg_code
        )
        console.log('[pg-sync/webhook] parent_pg_code stamp', parentStamp)
      }
    } catch (err) {
      console.error('[pg-sync/webhook] parent_pg_code stamp failed', err)
    }
  }

  return NextResponse.json({
    ok: true,
    received: event,
    persisted: updated,
    parent_pg_stamp: parentStamp,
  })
}
