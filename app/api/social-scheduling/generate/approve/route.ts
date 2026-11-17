import { NextResponse } from 'next/server'

import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { approveContentBatch } from '@/app/lib/social-content/generate'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json()) as { batchId?: string }
    if (!body.batchId) {
      return NextResponse.json({ error: 'batchId is required' }, { status: 422 })
    }
    const result = await approveContentBatch({
      userId: auth.user.id,
      batchId: body.batchId,
    })
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Approve failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
