import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobEventsView, PgSyncJobView } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function jobBelongsToUser(job: PgSyncJobView, pgCode: string): boolean {
  return job.pg_code?.trim().toUpperCase() === pgCode.trim().toUpperCase()
}

/** Replay worker webhook events (includes per-step browser screenshots). */
export async function GET(request: Request, ctx: Ctx) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params

  try {
    const job = await pgSyncFetch<PgSyncJobView>(`/v1/jobs/${encodeURIComponent(id)}`)
    if (!jobBelongsToUser(job, auth.session.pgCode)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const events = await pgSyncFetch<PgSyncJobEventsView>(
      `/v1/jobs/${encodeURIComponent(id)}/events`
    )
    return NextResponse.json({ ok: true, ...events })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch job events'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
