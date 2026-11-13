import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { TryPostApiError } from '@/app/lib/trypost/client'
import type {
  TryPostCreatePostsBatchInput,
  TryPostMediaReference,
  TryPostPublishMode,
  TryPostSocialAccount,
} from '@/app/lib/trypost/types'
import { isSupportedTryPostPlatform } from '@/app/lib/trypost/types'
import { getTryPostClientForUser } from '@/app/lib/trypost/workspaces'

export type CreateSocialPostDestination = {
  socialAccountId: string
  content?: string | null
  contentType?: string | null
  mediaUrls?: string[]
  meta?: Record<string, unknown>
}

export type CreateSocialPostsInput = {
  userId: string
  content: string
  socialAccountIds: string[]
  publishMode: TryPostPublishMode
  scheduledAt?: string | null
  mediaUrls?: string[]
  contentType?: string | null
  /** Per-channel overrides (content, media, content_type, meta). */
  destinations?: CreateSocialPostDestination[]
}

function resolveBatchStatus(
  mode: TryPostPublishMode
): Pick<TryPostCreatePostsBatchInput, 'status' | 'scheduled_at' | 'queue'> {
  switch (mode) {
    case 'draft':
      return { status: 'draft' }
    case 'now':
      return { status: 'publishing' }
    case 'queue_next':
      return { status: 'scheduled', queue: 'next' }
    case 'queue_top':
      return { status: 'scheduled', queue: 'top' }
    case 'scheduled':
      return { status: 'scheduled', scheduled_at: undefined }
    case 'pending_approval':
      // API admin keys publish directly; store as draft until approval UX exists for members.
      return { status: 'draft' }
    default:
      return { status: 'draft' }
  }
}

export async function createSocialPosts(input: CreateSocialPostsInput) {
  const content = input.content?.trim() ?? ''
  const media: TryPostMediaReference[] = (input.mediaUrls ?? [])
    .map((url) => url.trim())
    .filter(Boolean)
    .map((url) => ({ url }))

  const destinationInputs: CreateSocialPostDestination[] =
    input.destinations?.length
      ? input.destinations
      : input.socialAccountIds.map((socialAccountId) => ({
          socialAccountId,
          contentType: input.contentType ?? null,
        }))

  const hasAnyDestinationPayload = destinationInputs.some((dest) => {
    const destContent = (dest.content ?? content).trim()
    const destMedia = (dest.mediaUrls ?? input.mediaUrls ?? []).filter(Boolean)
    return Boolean(destContent || destMedia.length)
  })

  if (!content && media.length === 0 && !hasAnyDestinationPayload) {
    throw new TryPostApiError('Post needs text or media', 422)
  }
  if (!input.socialAccountIds.length && !destinationInputs.length) {
    throw new TryPostApiError('Select at least one connected channel', 422)
  }

  const { client, workspace } = await getTryPostClientForUser(input.userId)
  const channelById = new Map<string, TryPostSocialAccount>(
    (workspace.channels ?? []).map((c) => [c.id, c])
  )

  const accountIds =
    destinationInputs.length > 0
      ? destinationInputs.map((d) => d.socialAccountId)
      : input.socialAccountIds

  for (const id of accountIds) {
    const channel = channelById.get(id)
    if (!channel || !isSupportedTryPostPlatform(channel.platform)) {
      throw new TryPostApiError(`Channel ${id} is not a connected TryPost account`, 422)
    }
    if (channel.status !== 'connected') {
      throw new TryPostApiError(`Channel @${channel.username || channel.id} is not connected`, 422)
    }
  }

  const resolved = resolveBatchStatus(input.publishMode)
  if (input.publishMode === 'scheduled') {
    if (!input.scheduledAt) {
      throw new TryPostApiError('scheduledAt is required for scheduled posts', 422)
    }
    resolved.scheduled_at = input.scheduledAt
  }

  const batch = await client.createPostsBatch({
    ...resolved,
    content: content || null,
    media: media.length ? media : undefined,
    destinations: destinationInputs.map((dest) => {
      const destMedia = (dest.mediaUrls ?? [])
        .map((url) => url.trim())
        .filter(Boolean)
        .map((url) => ({ url }))
      return {
        social_account_id: dest.socialAccountId,
        content_type: dest.contentType ?? input.contentType ?? null,
        content: dest.content !== undefined ? dest.content : undefined,
        media: destMedia.length ? destMedia : undefined,
        meta: dest.meta && Object.keys(dest.meta).length ? dest.meta : undefined,
      }
    }),
  })

  const posts = batch.posts ?? []
  const admin = createServiceRoleClient()
  const destByAccount = new Map(destinationInputs.map((d) => [d.socialAccountId, d]))
  const rows = posts.map((post) => {
    const socialAccountId =
      String(post.social_account_id ?? input.socialAccountIds[0] ?? '')
    const channel = channelById.get(socialAccountId)
    const dest = destByAccount.get(socialAccountId)
    const destContent =
      dest?.content !== undefined && dest.content !== null ? dest.content : content || null
    const destMediaRefs: TryPostMediaReference[] = (dest?.mediaUrls ?? input.mediaUrls ?? [])
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url) => ({ url }))
    return {
      user_id: input.userId,
      workspace_id: workspace.id,
      trypost_post_id: post.id,
      trypost_post_group_id: post.post_group_id ? String(post.post_group_id) : null,
      social_account_id: socialAccountId,
      platform: channel?.platform ?? 'unknown',
      content: destContent,
      content_type:
        dest?.contentType ??
        input.contentType ??
        (post.content_type ? String(post.content_type) : null),
      media: destMediaRefs.length ? destMediaRefs : media,
      status: String(post.status ?? resolved.status),
      publish_mode: input.publishMode,
      scheduled_at: input.scheduledAt ?? (post.scheduled_at ? String(post.scheduled_at) : null),
      meta: dest?.meta ?? {},
      last_error: input.publishMode === 'pending_approval'
        ? 'Stored as draft: workspace API keys publish directly (pending_approval needs a member who requires approval).'
        : null,
    }
  })

  if (rows.length) {
    const { error } = await admin.from('trypost_posts').insert(rows)
    if (error) {
      throw new TryPostApiError(error.message || 'Failed to mirror posts locally', 500)
    }
  }

  return { posts, mirrored: rows.length }
}

export async function listMirroredPosts(userId: string, limit = 50) {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('trypost_posts')
    .select(
      'id, trypost_post_id, trypost_post_group_id, social_account_id, platform, content, content_type, media, status, publish_mode, scheduled_at, last_error, created_at, updated_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new TryPostApiError(error.message, 500)
  return data ?? []
}

export async function deleteMirroredPost(userId: string, localPostId: string) {
  const admin = createServiceRoleClient()
  const { data: row, error } = await admin
    .from('trypost_posts')
    .select('id, trypost_post_id')
    .eq('id', localPostId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error || !row) {
    throw new TryPostApiError('Post not found', 404)
  }

  if (row.trypost_post_id) {
    const { client } = await getTryPostClientForUser(userId)
    try {
      await client.deletePost(row.trypost_post_id)
    } catch (err) {
      if (!(err instanceof TryPostApiError && err.status === 422)) {
        throw err
      }
    }
  }

  const { error: delError } = await admin
    .from('trypost_posts')
    .delete()
    .eq('id', localPostId)
    .eq('user_id', userId)
  if (delError) throw new TryPostApiError(delError.message, 500)
}
