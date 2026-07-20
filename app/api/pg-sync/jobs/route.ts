import { NextResponse } from 'next/server'
import { requirePgSyncSession } from '@/app/lib/pg-sync/auth'
import { pgSyncWebhookUrl } from '@/app/lib/pg-sync/config'
import { insertPgSyncJob } from '@/app/lib/pg-sync/jobs-db'
import { pgSyncFetch } from '@/app/lib/pg-sync/server-client'
import type { PgSyncCreateJobResponse } from '@/app/lib/pg-sync/types'

export const dynamic = 'force-dynamic'

type CreateBody = {
  pg_password?: string
  crmpg_password?: string
}

export async function POST(request: Request) {
  const auth = await requirePgSyncSession(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: CreateBody
  try {
    body = (await request.json()) as CreateBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const pgPassword = body.pg_password?.trim() ?? ''
  const crmpgPassword = body.crmpg_password?.trim() ?? ''

  if (!pgPassword) {
    return NextResponse.json({ error: 'PG Mall Business Center password is required.' }, { status: 400 })
  }
  if (!crmpgPassword) {
    return NextResponse.json({ error: 'CRMPG password is required.' }, { status: 400 })
  }

  try {
    const created = await pgSyncFetch<PgSyncCreateJobResponse>('/v1/jobs', {
      method: 'POST',
      body: JSON.stringify({
        pg_code: auth.session.pgCode,
        pg_password: pgPassword,
        crmpg_email: auth.session.email,
        crmpg_password: crmpgPassword,
        webhook_url: pgSyncWebhookUrl(),
      }),
    })

    await insertPgSyncJob(auth.supabase, {
      userId: auth.session.userId,
      pgCode: auth.session.pgCode,
      workerJobId: created.job_id,
      status: created.status,
      queuePosition: created.queue_position,
    })

    return NextResponse.json(
      {
        ok: true,
        job: created,
        pg_code: auth.session.pgCode,
      },
      { status: 202 }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to start sync job'
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
