import {
  TRYPOST_SUPPORTED_PLATFORMS,
  isSupportedTryPostPlatform,
  type TryPostSupportedPlatform,
} from '@/app/lib/trypost/platforms'

export { TRYPOST_SUPPORTED_PLATFORMS, isSupportedTryPostPlatform, type TryPostSupportedPlatform }

export type TryPostPublishMode =
  | 'draft'
  | 'scheduled'
  | 'queue_next'
  | 'queue_top'
  | 'now'
  | 'pending_approval'

export type TryPostWorkspaceStatus = 'connected' | 'disconnected' | 'error'

export type TryPostSocialAccount = {
  id: string
  platform: string
  display_name: string | null
  username: string | null
  status: 'connected' | 'disconnected' | 'token_expired'
  has_posting_schedule: boolean
  timezone: string
  posting_goal: number | null
  max_content_length: number
  long_posts?: boolean
  /** Profile image from TryPost CDN (enriched from posts.display_avatar). */
  avatar_url?: string | null
}

export type TryPostWorkspaceInfo = {
  id: string
  name: string
  created_at?: string
  updated_at?: string
  me?: {
    is_admin?: boolean
    requires_approval?: boolean
    publishes_directly?: boolean
  }
}

export type TryPostMediaReference =
  | { upload_token: string; alt?: string }
  | { url: string; alt?: string }
  | { id: string; alt?: string }

export type TryPostCreatePostsBatchInput = {
  status: 'draft' | 'scheduled' | 'publishing'
  content?: string | null
  media?: TryPostMediaReference[]
  scheduled_at?: string | null
  queue?: 'next' | 'top' | null
  destinations: Array<{
    social_account_id: string
    content?: string | null
    content_type?: string | null
    media?: TryPostMediaReference[]
    meta?: Record<string, unknown>
  }>
}

export type TryPostApiPost = {
  id: string
  post_group_id?: string | null
  social_account_id?: string
  content?: string | null
  content_type?: string | null
  status?: string
  scheduled_at?: string | null
  published_at?: string | null
  platform?: string
  display_name?: string | null
  display_username?: string | null
  media?: unknown[]
  social_account?: TryPostSocialAccount | null
  [key: string]: unknown
}

export type SocialCalendarEvent = {
  id: string
  source: 'trypost' | 'local'
  trypostPostId: string | null
  localPostId: string | null
  content: string | null
  status: string
  /** Instant used to place the event on the calendar (ISO). */
  at: string
  kind: 'scheduled' | 'published' | 'draft' | 'failed' | 'pending_approval' | 'other'
  platform: string
  channelId: string | null
  channelUsername: string | null
  channelDisplayName: string | null
  channelAvatarUrl: string | null
  mediaCount: number
  mediaThumbUrl: string | null
  /** How to render the calendar chip preview (TryPost uses <video #t=0.1> for videos). */
  mediaThumbKind: 'image' | 'video' | null
}

export type TryPostWorkspaceRow = {
  id: string
  user_id: string
  trypost_workspace_id: string
  trypost_workspace_name: string | null
  api_key: string
  status: TryPostWorkspaceStatus
  last_error: string | null
  channels: TryPostSocialAccount[]
  channels_synced_at: string | null
  created_at: string
  updated_at: string
}

export type TryPostWorkspacePublic = Omit<TryPostWorkspaceRow, 'api_key'> & {
  apiKeyConfigured: boolean
}

/** Keep every TryPost-connected channel (all supported networks). */
export function filterSupportedChannels(accounts: TryPostSocialAccount[]): TryPostSocialAccount[] {
  return accounts.filter((a) => isSupportedTryPostPlatform(a.platform))
}

/** @deprecated Use filterSupportedChannels */
export const filterIgFbChannels = filterSupportedChannels
