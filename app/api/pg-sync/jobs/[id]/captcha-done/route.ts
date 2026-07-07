import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncJobView } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(_request: Request, ctx: Ctx) {
  const auth = await requirePgSyncSession()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params

  try {
    const job = await pgSyncFetch<PgSyncJobView>(`/v1/jobs/${encodeURIComponent(id)}`)
    if (job.pg_code?.trim().toUpperCase() !== auth.session.pgCode) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const result = await pgSyncFetch<Record<string, string>>(
      `/v1/jobs/${encodeURIComponent(id)}/captcha-done`,
      { method: 'POST' }
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to confirm CAPTCHA'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
