import { NextResponse } from 'next/server'

import { TryPostApiError } from '@/app/lib/trypost/client'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
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

function metricValue(
  metrics: Record<string, { value?: number | null }> | undefined,
  key: string
): number | null {
  const entry = metrics?.[key]
  if (!entry || entry.value == null || Number.isNaN(Number(entry.value))) return null
  return Number(entry.value)
}

export async function GET(request: Request) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const url = new URL(request.url)
    const postId = url.searchParams.get('id')?.trim()
    if (!postId) {
      return NextResponse.json({ error: 'Post id is required' }, { status: 400 })
    }

    const { client } = await getTryPostClientForUser(auth.user.id)
    const post = await client.getPost(postId)

    let metrics: {
      views: number | null
      reach: number | null
      engagementRate: number | null
      reactions: number | null
      comments: number | null
      unsupportedReason: string | null
    } | null = null

    try {
      const raw = await client.getPostMetrics(postId)
      const body = raw.metrics
      if (body && 'unsupported' in body && body.unsupported) {
        metrics = {
          views: null,
          reach: null,
          engagementRate: null,
          reactions: null,
          comments: null,
          unsupportedReason: String(body.reason || 'unsupported'),
        }
      } else if (body && typeof body === 'object') {
        const keyed =
          body.metrics && !Array.isArray(body.metrics)
            ? (body.metrics as Record<string, { value?: number | null }>)
            : undefined
        const snap = body.snapshot
        metrics = {
          views:
            metricValue(keyed, 'views') ??
            metricValue(keyed, 'impressions') ??
            snap?.views_count ??
            snap?.impressions_count ??
            null,
          reach: metricValue(keyed, 'reach') ?? snap?.reach_count ?? null,
          engagementRate: metricValue(keyed, 'engagement_rate'),
          reactions: metricValue(keyed, 'reactions') ?? snap?.reactions_count ?? null,
          comments: metricValue(keyed, 'comments') ?? snap?.comments_count ?? null,
          unsupportedReason: null,
        }
      }
    } catch {
      metrics = null
    }

    const media = Array.isArray(post.media) ? post.media : []
    const first = media[0] as { url?: string; type?: string; mime_type?: string } | undefined
    const mediaUrl = first?.url ? String(first.url) : null
    const mediaType = String(first?.type || first?.mime_type || '').toLowerCase()
    const mediaKind =
      mediaUrl &&
      (mediaType.includes('video') || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(mediaUrl))
        ? 'video'
        : mediaUrl
          ? 'image'
          : null

    return NextResponse.json({
      post: {
        id: post.id,
        content: post.content ?? null,
        status: post.status ?? null,
        publishStatus: post.publish_status ?? null,
        platform: post.platform || post.social_account?.platform || null,
        contentType: post.content_type ?? null,
        scheduledAt: post.scheduled_at ?? null,
        publishedAt: post.published_at ?? null,
        platformUrl: post.platform_url ?? null,
        displayName: post.display_name || post.social_account?.display_name || null,
        displayUsername: post.display_username || post.social_account?.username || null,
        displayAvatar:
          typeof post.display_avatar === 'string' ? post.display_avatar : null,
        mediaUrl,
        mediaKind,
        mediaCount: media.length,
        errorMessage: post.error_message ?? null,
      },
      metrics,
    })
  } catch (err) {
    return errorResponse(err)
  }
}
