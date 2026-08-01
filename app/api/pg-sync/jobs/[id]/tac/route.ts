import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { getPgSyncJobByWorkerId, markPgSyncJobTacSubmitted } from '@/app/lib/pg-sync/jobs-db'
import { PgSyncApiError, pgSyncFetch } from '@/app/lib/pg-sync/server-client'

export const dynamic = 'force-dynamic'

/** Worker accepts TAC into TacBridge quickly; browser verify runs async (~12s on worker). */
const TAC_FORWARD_TIMEOUT_MS = 8_000

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { id } = await ctx.params

  let tac = ''
  try {
    const body = (await request.json()) as { tac?: string }
    tac = body.tac?.trim() ?? ''
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!tac) {
    return NextResponse.json({ error: 'TAC code is required.' }, { status: 400 })
  }

  const row = await getPgSyncJobByWorkerId(id)
  if (!row || row.user_id !== auth.session.userId) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  if (row.pg_code.trim().toUpperCase() !== auth.session.pgCode) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  try {
    const result = await pgSyncFetch<{ status?: string; tac_filled?: boolean; message?: string }>(
      `/v1/jobs/${encodeURIComponent(id)}/tac`,
      {
        method: 'POST',
        body: JSON.stringify({ tac }),
        timeoutMs: TAC_FORWARD_TIMEOUT_MS,
      }
    )
    await markPgSyncJobTacSubmitted(auth.session.userId, id)
    return NextResponse.json({ ok: true, accepted: true, tac_filled: true, ...result })
  } catch (e: unknown) {
    if (e instanceof PgSyncApiError) {
      if (e.status === 408) {
        await markPgSyncJobTacSubmitted(auth.session.userId, id)
        return NextResponse.json({
          ok: true,
          accepted: true,
          pending: true,
          tac_filled: true,
          message: 'TAC received — verifying with PG Mall. This may take a minute.',
        })
      }
      if (e.status >= 400 && e.status < 500) {
        return NextResponse.json({ error: e.message }, { status: e.status })
      }
    }
    const msg = e instanceof Error ? e.message : 'Failed to submit TAC'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
