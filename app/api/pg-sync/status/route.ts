import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { isPgSyncJobActive, resolveActiveJobIdForPgCode } from '@/app/lib/pg-sync/active-job'
import { buildQueueInfo } from '@/app/lib/pg-sync/queue-info'
import {
  getActivePgSyncJobForUser,
  reconcileStalePgSyncJob,
  resolveActiveJobId,
  syncPgSyncJobFromView,
} from '@/app/lib/pg-sync/jobs-db'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobView, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export async function GET(request: Request) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    let dbJob = await getActivePgSyncJobForUser(auth.supabase, auth.session.userId)

    const status = await pgSyncFetch<PgSyncServiceStatus>('/v1/status')
    const myQueueEntry = status.queue.find(
      (q) => q.pg_code.toUpperCase() === auth.session.pgCode
    )

    const workerActiveJobId = resolveActiveJobIdForPgCode(status, auth.session.pgCode)
    let reconciledLiveJob: PgSyncJobView | null = null

    if (dbJob) {
      const reconciled = await reconcileStalePgSyncJob(
        auth.supabase,
        auth.session.userId,
        dbJob,
        status,
        workerActiveJobId
      )
      dbJob = reconciled.dbJob
      reconciledLiveJob = reconciled.liveJob
    }

    let activeJobId = resolveActiveJobId(workerActiveJobId)
    let activeJob: PgSyncJobView | null = reconciledLiveJob
    if (activeJob) activeJobId = activeJob.id

    if (activeJobId && !activeJob) {
      try {
        activeJob = await pgSyncFetch<PgSyncJobView>(
          `/v1/jobs/${encodeURIComponent(activeJobId)}`
        )
        if (activeJob.pg_code?.trim().toUpperCase() !== auth.session.pgCode) {
          activeJobId = null
          activeJob = null
        } else {
          await syncPgSyncJobFromView(auth.session.userId, activeJob)
          if (TERMINAL.has(activeJob.status)) {
            activeJobId = null
            activeJob = null
          }
        }
      } catch {
        activeJobId = null
        activeJob = null
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
      db_job: dbJob && isPgSyncJobActive(dbJob.status) ? dbJob : null,
      queue_info,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to reach sync service'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
