import { after, NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import {
  getLatestContentBatch,
  processContentBatchGeneration,
  startContentBatchGeneration,
} from '@/app/lib/social-content/generate'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const batch = await getLatestContentBatch(auth.user.id)
    return NextResponse.json({ batch })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load batch'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as { recreate?: boolean }
    const batch = await startContentBatchGeneration({
      userId: auth.user.id,
      recreate: Boolean(body.recreate),
    })

    // Continue after response — true background generation.
    const userId = auth.user.id
    const batchId = batch.id
    after(async () => {
      try {
        await processContentBatchGeneration({ userId, batchId })
      } catch (err) {
        console.error('[social-content] background generate failed', batchId, err)
      }
    })

    return NextResponse.json({
      batch,
      background: true,
      message: 'Generation started in background.',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generate failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
