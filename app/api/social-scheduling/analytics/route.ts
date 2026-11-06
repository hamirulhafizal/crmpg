import { NextResponse } from 'next/server'

import { TryPostApiError } from '@/app/lib/trypost/client'
import {
  assertTryPostAnalyticsAccess,
  requireSocialSchedulingApi,
} from '@/app/lib/trypost/access'
import { getTryPostClientForUser } from '@/app/lib/trypost/workspaces'

function errorResponse(err: unknown) {
  if (err instanceof TryPostApiError) {
    return NextResponse.json(
      { error: err.message, details: err.body },
      { status: err.status >= 400 && err.status < 600 ? err.status : 500 }
    )
  }
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const gate = await assertTryPostAnalyticsAccess(auth.user.id)
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error, code: gate.code }, { status: 403 })
    }

    const url = new URL(request.url)
    const range = url.searchParams.get('range') ?? '30d'
    const accountId = url.searchParams.get('accountId')

    const { client } = await getTryPostClientForUser(auth.user.id)
    if (accountId) {
      const insights = await client.getChannelInsights(accountId, { range })
      return NextResponse.json({ insights })
    }

    const report = await client.getWorkspaceAnalytics({ range })
    return NextResponse.json({ report })
  } catch (err) {
    return errorResponse(err)
  }
}
