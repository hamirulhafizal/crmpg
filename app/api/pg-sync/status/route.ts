import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { resolveActiveJobIdForPgCode } from '@/app/lib/pg-sync/active-job'
import { buildQueueInfo } from '@/app/lib/pg-sync/queue-info'
import {
  getActivePgSyncJobForUser,
  resolveActiveJobId,
  syncPgSyncJobFromView,
} from '@/app/lib/pg-sync/jobs-db'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobView, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requirePgSyncSession()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    const supabase = await createClient()
    const dbJob = await getActivePgSyncJobForUser(supabase, auth.session.userId)

    const status = await pgSyncFetch<PgSyncServiceStatus>('/v1/status')
    const myQueueEntry = status.queue.find(
      (q) => q.pg_code.toUpperCase() === auth.session.pgCode
    )

    const workerActiveJobId = resolveActiveJobIdForPgCode(status, auth.session.pgCode)
    let activeJobId = resolveActiveJobId(workerActiveJobId, dbJob)
    let activeJob: PgSyncJobView | null = null

    if (activeJobId) {
      try {
        activeJob = await pgSyncFetch<PgSyncJobView>(
          `/v1/jobs/${encodeURIComponent(activeJobId)}`
        )
        if (activeJob.pg_code?.trim().toUpperCase() !== auth.session.pgCode) {
          activeJobId = null
          activeJob = null
        } else {
          await syncPgSyncJobFromView(auth.session.userId, activeJob)
        }
      } catch {
        activeJobId = dbJob?.worker_job_id ?? null
        activeJob = null
      }
    }

    if (!activeJob && dbJob && activeJobId === dbJob.worker_job_id) {
      activeJob = {
        id: dbJob.worker_job_id,
        status: dbJob.status,
        pg_code: dbJob.pg_code,
        queue_position: dbJob.queue_position,
        sync_progress: dbJob.progress,
        error: dbJob.error_message,
      }
    }

    const queue_info = buildQueueInfo({
      status,
      myPgCode: auth.session.pgCode,
      myQueuePosition: activeJob?.queue_position ?? myQueueEntry?.position ?? null,
      myJobStatus: activeJob?.status ?? myQueueEntry?.status ?? null,
    })

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
      db_job: dbJob,
      queue_info,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to reach sync service'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
