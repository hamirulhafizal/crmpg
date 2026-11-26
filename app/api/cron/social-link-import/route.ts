import { NextResponse } from 'next/server'

import { reclaimAndProcessLinkImportJobs } from '@/app/lib/social-content/link-import-jobs'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const q = new URL(request.url).searchParams.get('secret')
  return q === secret
}

/** Reclaim stale paste-link jobs if the original serverless after() died. */
export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const processed = await reclaimAndProcessLinkImportJobs(3)
    return NextResponse.json({ ok: true, processed })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Cron failed'
    console.error('[cron/social-link-import]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  return GET(request)
}
