import { NextResponse } from 'next/server'

import { TryPostApiError } from '@/app/lib/trypost/client'
import {
  assertTryPostChannelLimit,
  requireSocialSchedulingApi,
} from '@/app/lib/trypost/access'
import {
  createSocialPosts,
  listMirroredPosts,
} from '@/app/lib/trypost/posts'
import type { TryPostPublishMode } from '@/app/lib/trypost/types'

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

const PUBLISH_MODES = new Set<TryPostPublishMode>([
  'draft',
  'scheduled',
  'queue_next',
  'queue_top',
  'now',
  'pending_approval',
])

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const posts = await listMirroredPosts(auth.user.id)
    return NextResponse.json({ posts })
  } catch (err) {
    return errorResponse(err)
  }
}

export async function POST(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const limit = await assertTryPostChannelLimit(auth.user.id)
    if (!limit.ok) {
      return NextResponse.json({ error: limit.error, code: limit.code }, { status: 403 })
    }

    const body = (await request.json()) as {
      content?: string
      socialAccountIds?: string[]
      publishMode?: string
      scheduledAt?: string | null
      mediaUrls?: string[]
      contentType?: string | null
      destinations?: Array<{
        socialAccountId?: string
        content?: string | null
        contentType?: string | null
        mediaUrls?: string[]
        meta?: Record<string, unknown>
      }>
    }

    const publishMode = (body.publishMode ?? 'draft') as TryPostPublishMode
    if (!PUBLISH_MODES.has(publishMode)) {
      return NextResponse.json({ error: 'Invalid publishMode' }, { status: 422 })
    }

    const destinations = Array.isArray(body.destinations)
      ? body.destinations
          .filter((d) => typeof d?.socialAccountId === 'string' && d.socialAccountId)
          .map((d) => ({
            socialAccountId: String(d.socialAccountId),
            content: d.content,
            contentType: d.contentType ?? null,
            mediaUrls: Array.isArray(d.mediaUrls) ? d.mediaUrls : undefined,
            meta: d.meta && typeof d.meta === 'object' ? d.meta : undefined,
          }))
      : undefined

    const result = await createSocialPosts({
      userId: auth.user.id,
      content: body.content ?? '',
      socialAccountIds: Array.isArray(body.socialAccountIds)
        ? body.socialAccountIds
        : destinations?.map((d) => d.socialAccountId) ?? [],
      publishMode,
      scheduledAt: body.scheduledAt ?? null,
      mediaUrls: Array.isArray(body.mediaUrls) ? body.mediaUrls : [],
      contentType: body.contentType ?? null,
      destinations,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    return errorResponse(err)
  }
}
