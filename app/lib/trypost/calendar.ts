import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { TryPostApiError } from '@/app/lib/trypost/client'
import {
  isSupportedTryPostPlatform,
  type SocialCalendarEvent,
  type TryPostApiPost,
} from '@/app/lib/trypost/types'
import { getTryPostClientForUser, loadTryPostWorkspaceForUser } from '@/app/lib/trypost/workspaces'

export { localDateKey } from '@/app/lib/trypost/calendar-shared'

function firstMediaThumb(media: unknown[]): {
  url: string | null
  kind: 'image' | 'video' | null
} {
  const first = media[0] as
    | { url?: string; type?: string; mime_type?: string; path?: string }
    | undefined
  if (!first?.url) return { url: null, kind: null }
  const url = String(first.url)
  const type = String(first.type || first.mime_type || '').toLowerCase()
  const isVideo =
    type.includes('video') ||
    /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url) ||
    /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(String(first.path || ''))
  return { url, kind: isVideo ? 'video' : 'image' }
}

function parseTryPostDate(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // TryPost often returns "YYYY-MM-DD HH:mm:ss" in UTC without a Z suffix.
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(' ', 'T')}Z`
    : trimmed
  const ms = Date.parse(normalized)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toISOString()
}

function kindFromStatus(status: string | undefined): SocialCalendarEvent['kind'] {
  switch (status) {
    case 'scheduled':
      return 'scheduled'
    case 'published':
      return 'published'
    case 'draft':
      return 'draft'
    case 'failed':
      return 'failed'
    case 'pending_approval':
      return 'pending_approval'
    default:
      return 'other'
  }
}

function eventFromTryPost(post: TryPostApiPost): SocialCalendarEvent | null {
  const platform =
    post.platform ||
    post.social_account?.platform ||
    ''
  if (!isSupportedTryPostPlatform(platform)) return null

  const at =
    parseTryPostDate(post.scheduled_at) ||
    parseTryPostDate(post.published_at) ||
    null
  if (!at) return null

  const channel = post.social_account
  const media = Array.isArray(post.media) ? post.media : []
  const mediaCount = media.length
  const thumb = firstMediaThumb(media)
  const avatar =
    typeof post.display_avatar === 'string'
      ? post.display_avatar
      : null

  return {
    id: `trypost:${post.id}`,
    source: 'trypost',
    trypostPostId: post.id,
    localPostId: null,
    content: post.content ?? null,
    status: String(post.status ?? 'unknown'),
    at,
    kind: kindFromStatus(post.status),
    platform,
    channelId: channel?.id || (post.social_account_id ? String(post.social_account_id) : null),
    channelUsername: post.display_username || channel?.username || null,
    channelDisplayName: post.display_name || channel?.display_name || null,
    channelAvatarUrl: avatar,
    mediaCount,
    mediaThumbUrl: thumb.url,
    mediaThumbKind: thumb.kind,
  }
}

export async function loadSocialCalendarEvents(userId: string): Promise<SocialCalendarEvent[]> {
  const workspace = await loadTryPostWorkspaceForUser(userId)
  if (!workspace) {
    throw new TryPostApiError('TryPost workspace is not connected', 400)
  }

  const { client } = await getTryPostClientForUser(userId)
  const igFbChannelIds = (workspace.channels ?? [])
    .filter((c) => isSupportedTryPostPlatform(c.platform))
    .map((c) => c.id)

  const remoteStatuses = ['scheduled', 'published', 'pending_approval', 'failed'] as const
  const remotePosts: TryPostApiPost[] = []
  for (const status of remoteStatuses) {
    try {
      const page = await client.listAllPosts(
        igFbChannelIds.length
          ? { status, channels: igFbChannelIds }
          : { status },
        10
      )
      remotePosts.push(...page)
    } catch {
      // Fall back without channel filter if TryPost rejects channels[].
      const page = await client.listAllPosts({ status }, 10)
      remotePosts.push(...page)
    }
  }

  const byRemoteId = new Map<string, SocialCalendarEvent>()
  for (const post of remotePosts) {
    const event = eventFromTryPost(post)
    if (event) byRemoteId.set(post.id, event)
  }

  const admin = createServiceRoleClient()
  const { data: localRows } = await admin
    .from('trypost_posts')
    .select(
      'id, trypost_post_id, social_account_id, platform, content, status, publish_mode, scheduled_at, media, created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200)

  const channelById = new Map((workspace.channels ?? []).map((c) => [c.id, c]))
  const events = [...byRemoteId.values()]

  for (const row of localRows ?? []) {
    const trypostId = row.trypost_post_id ? String(row.trypost_post_id) : null
    if (trypostId && byRemoteId.has(trypostId)) {
      const existing = byRemoteId.get(trypostId)!
      existing.localPostId = String(row.id)
      continue
    }

    if (!isSupportedTryPostPlatform(String(row.platform))) continue

    const at =
      parseTryPostDate(row.scheduled_at) ||
      (row.status === 'draft' ? parseTryPostDate(row.created_at) : null)
    if (!at) continue

    const channel = channelById.get(String(row.social_account_id))
    const media = Array.isArray(row.media) ? row.media : []
    const thumb = firstMediaThumb(media)
    events.push({
      id: `local:${row.id}`,
      source: 'local',
      trypostPostId: trypostId,
      localPostId: String(row.id),
      content: row.content ?? null,
      status: String(row.status ?? 'draft'),
      at,
      kind: kindFromStatus(String(row.status)),
      platform: String(row.platform),
      channelId: row.social_account_id ? String(row.social_account_id) : null,
      channelUsername: channel?.username ?? null,
      channelDisplayName: channel?.display_name ?? null,
      channelAvatarUrl: null,
      mediaCount: media.length,
      mediaThumbUrl: thumb.url,
      mediaThumbKind: thumb.kind,
    })
  }

  events.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  return events
}
