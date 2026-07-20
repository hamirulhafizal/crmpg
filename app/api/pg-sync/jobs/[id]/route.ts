import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { markPgSyncJobCancelled, syncPgSyncJobFromView } from '@/app/lib/pg-sync/jobs-db'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobView } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

function jobBelongsToUser(job: PgSyncJobView, pgCode: string): boolean {
  return job.pg_code?.trim().toUpperCase() === pgCode.trim().toUpperCase()
}

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
    await syncPgSyncJobFromView(auth.session.userId, job)
    return NextResponse.json({ ok: true, job })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to fetch job'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params
  const dismiss = new URL(request.url).searchParams.get('dismiss') === '1'

  try {
    const job = await pgSyncFetch<PgSyncJobView>(`/v1/jobs/${encodeURIComponent(id)}`)
    if (!jobBelongsToUser(job, auth.session.pgCode)) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const qs = dismiss ? '?dismiss=true' : ''
    const result = await pgSyncFetch<Record<string, string>>(
      `/v1/jobs/${encodeURIComponent(id)}${qs}`,
      { method: 'DELETE' }
    )

    await markPgSyncJobCancelled(auth.session.userId, id)

    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to cancel job'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
