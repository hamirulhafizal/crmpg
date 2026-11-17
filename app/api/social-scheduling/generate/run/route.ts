import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { processContentBatchGeneration } from '@/app/lib/social-content/generate'

export const runtime = 'nodejs'
export const maxDuration = 300

/** Resume / force-run a generating batch (fallback if `after()` was interrupted). */
export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as { batchId?: string }
    if (!body.batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 422 })
    }
    const batch = await processContentBatchGeneration({
      userId: auth.user.id,
      batchId: body.batchId,
    })
    return NextResponse.json({ batch })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Run failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
