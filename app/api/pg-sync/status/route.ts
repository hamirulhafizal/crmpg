import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { resolveActiveJobIdForPgCode } from '@/app/lib/pg-sync/active-job'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobView, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requirePgSyncSession()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const status = await pgSyncFetch<PgSyncServiceStatus>('/v1/status')
    const myQueueEntry = status.queue.find(
      (q) => q.pg_code.toUpperCase() === auth.session.pgCode
    )

    let activeJobId = resolveActiveJobIdForPgCode(status, auth.session.pgCode)
    let activeJob: PgSyncJobView | null = null

    if (activeJobId) {
      try {
        activeJob = await pgSyncFetch<PgSyncJobView>(
          `/v1/jobs/${encodeURIComponent(activeJobId)}`
        )
        if (activeJob.pg_code?.trim().toUpperCase() !== auth.session.pgCode) {
          activeJobId = null
          activeJob = null
        }
      } catch {
        activeJobId = null
        activeJob = null
      }
    }

    return NextResponse.json({
      ok: true,
      pg_code: auth.session.pgCode,
      status,
      my_queue: myQueueEntry ?? null,
      is_my_turn:
        !status.busy ||
        status.current_pg_code?.toUpperCase() === auth.session.pgCode,
      active_job_id: activeJobId,
      active_job: activeJob,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to reach sync service'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
