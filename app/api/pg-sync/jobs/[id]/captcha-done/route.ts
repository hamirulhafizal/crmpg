import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { getPgSyncJobByWorkerId } from '@/app/lib/pg-sync/jobs-db'
import { PgSyncApiError, pgSyncFetch } from '@/app/lib/pg-sync/server-client'

export const dynamic = 'force-dynamic'

const CAPTCHA_FORWARD_TIMEOUT_MS = 12_000

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params

  const row = await getPgSyncJobByWorkerId(id)
  if (!row || row.user_id !== auth.session.userId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (row.pg_code.trim().toUpperCase() !== auth.session.pgCode) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  try {
    const result = await pgSyncFetch<Record<string, string>>(
      `/v1/jobs/${encodeURIComponent(id)}/captcha-done`,
      { method: 'POST', timeoutMs: CAPTCHA_FORWARD_TIMEOUT_MS }
    )
    return NextResponse.json({ ok: true, accepted: true, ...result })
  } catch (e: unknown) {
    if (e instanceof PgSyncApiError && e.status === 408) {
      return NextResponse.json({
        ok: true,
        accepted: true,
        pending: true,
        message: 'CAPTCHA confirmed — continuing sync.',
      })
    }
    const msg = e instanceof Error ? e.message : 'Failed to confirm CAPTCHA'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
