import { after, NextResponse } from 'next/server'

import {
  enqueueLinkImportJob,
  getActiveLinkImportJobForUser,
  getLatestLinkImportJobForUser,
  getLinkImportJobForUser,
  processLinkImportJob,
} from '@/app/lib/social-content/link-import-jobs'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic'

/**
 * GET — poll job status.
 * ?jobId=… | ?active=1 | latest job if omitted
 */
export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const { searchParams } = new URL(request.url)
    const jobId = searchParams.get('jobId')?.trim()
    const activeOnly = searchParams.get('active') === '1'

    if (jobId) {
      const job = await getLinkImportJobForUser(auth.user.id, jobId)
      if (!job) return NextResponse.json({ error: 'Job not found.' }, { status: 404 })
      return NextResponse.json({ job })
    }

    if (activeOnly) {
      const job = await getActiveLinkImportJobForUser(auth.user.id)
      return NextResponse.json({ job })
    }

    const job = await getLatestLinkImportJobForUser(auth.user.id)
    return NextResponse.json({ job })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to load import job'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

/**
 * POST — enqueue background paste-link import (survives PWA close).
 * Body: { url: string }
 */
export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => null)) as { url?: string } | null
    const url = typeof body?.url === 'string' ? body.url.trim() : ''
    if (!url) {
      return NextResponse.json({ error: 'Paste a social video URL.' }, { status: 400 })
    }

    const job = await enqueueLinkImportJob({ userId: auth.user.id, url })
    const jobId = job.id

    after(async () => {
      try {
        await processLinkImportJob(jobId)
      } catch (err) {
        console.error('[link-import] background process failed', jobId, err)
      }
    })

    return NextResponse.json({
      job,
      background: true,
      message: 'Import started in background. You can close the app — it will keep processing.',
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Import failed'
    console.error('Social link-import enqueue error:', e)
    return NextResponse.json({ error: message, source: 'server' }, { status: 500 })
  }
}
