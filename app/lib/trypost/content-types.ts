/**
 * TryPost content-type catalog + lightweight validation for the composer UI.
 * Keep in sync with list-content-types-tool / TryPost docs.
 */

export type TryPostContentTypeRule = {
  value: string
  label: string
  requires_media: boolean
  accept_images: boolean
  accept_videos: boolean
  accept_documents: boolean
  max_media_count: number
  min_media_count: number
  captionless: boolean
  max_video_duration_sec: number | null
}

export type TryPostPlatformRules = {
  platform: string
  label: string
  max_content_length: number
  max_hashtags: number | null
  required_meta: string[]
  default_content_type: string
  content_types: TryPostContentTypeRule[]
}

const INSTAGRAM_TYPES: TryPostContentTypeRule[] = [
  {
    value: 'instagram_feed',
    label: 'Feed Post',
    requires_media: true,
    accept_images: true,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 10,
    min_media_count: 0,
    captionless: false,
    max_video_duration_sec: 60,
  },
  {
    value: 'instagram_reel',
    label: 'Reel',
    requires_media: true,
    accept_images: false,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 1,
    min_media_count: 0,
    captionless: false,
    max_video_duration_sec: 900,
  },
  {
    value: 'instagram_story',
    label: 'Story',
    requires_media: true,
    accept_images: true,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 1,
    min_media_count: 0,
    captionless: true,
    max_video_duration_sec: 60,
  },
]

const FACEBOOK_TYPES: TryPostContentTypeRule[] = [
  {
    value: 'facebook_post',
    label: 'Post',
    requires_media: false,
    accept_images: true,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 10,
    min_media_count: 0,
    captionless: false,
    max_video_duration_sec: 14400,
  },
  {
    value: 'facebook_reel',
    label: 'Reel',
    requires_media: true,
    accept_images: false,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 1,
    min_media_count: 0,
    captionless: false,
    max_video_duration_sec: 90,
  },
  {
    value: 'facebook_story',
    label: 'Story',
    requires_media: true,
    accept_images: true,
    accept_videos: true,
    accept_documents: false,
    max_media_count: 1,
    min_media_count: 0,
    captionless: true,
    max_video_duration_sec: 60,
  },
]

export const TRYPOST_PLATFORM_RULES: Record<string, TryPostPlatformRules> = {
  instagram: {
    platform: 'instagram',
    label: 'Instagram',
    max_content_length: 2200,
    max_hashtags: 5,
    required_meta: [],
    default_content_type: 'instagram_feed',
    content_types: INSTAGRAM_TYPES,
  },
  'instagram-facebook': {
    platform: 'instagram-facebook',
    label: 'Instagram',
    max_content_length: 2200,
    max_hashtags: 5,
    required_meta: [],
    default_content_type: 'instagram_feed',
    content_types: INSTAGRAM_TYPES,
  },
  facebook: {
    platform: 'facebook',
    label: 'Facebook',
    max_content_length: 10000,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'facebook_post',
    content_types: FACEBOOK_TYPES,
  },
  tiktok: {
    platform: 'tiktok',
    label: 'TikTok',
    max_content_length: 2200,
    max_hashtags: null,
    required_meta: ['privacy_level'],
    default_content_type: 'tiktok_video',
    content_types: [
      {
        value: 'tiktok_video',
        label: 'Video',
        requires_media: true,
        accept_images: false,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 1,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 600,
      },
      {
        value: 'tiktok_photo',
        label: 'Photo carousel',
        requires_media: true,
        accept_images: true,
        accept_videos: false,
        accept_documents: false,
        max_media_count: 35,
        min_media_count: 1,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
  youtube: {
    platform: 'youtube',
    label: 'YouTube',
    max_content_length: 5000,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'youtube_short',
    content_types: [
      {
        value: 'youtube_short',
        label: 'Short',
        requires_media: true,
        accept_images: false,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 1,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 180,
      },
    ],
  },
  linkedin: {
    platform: 'linkedin',
    label: 'LinkedIn',
    max_content_length: 3000,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'linkedin_post',
    content_types: [
      {
        value: 'linkedin_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: true,
        max_media_count: 10,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 600,
      },
    ],
  },
  'linkedin-page': {
    platform: 'linkedin-page',
    label: 'LinkedIn Page',
    max_content_length: 3000,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'linkedin_page_post',
    content_types: [
      {
        value: 'linkedin_page_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: true,
        max_media_count: 10,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 600,
      },
    ],
  },
  x: {
    platform: 'x',
    label: 'X',
    max_content_length: 280,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'x_post',
    content_types: [
      {
        value: 'x_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 4,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 1200,
      },
    ],
  },
  threads: {
    platform: 'threads',
    label: 'Threads',
    max_content_length: 500,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'threads_post',
    content_types: [
      {
        value: 'threads_post',
        label: 'Thread',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 10,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 300,
      },
    ],
  },
  pinterest: {
    platform: 'pinterest',
    label: 'Pinterest',
    max_content_length: 800,
    max_hashtags: null,
    required_meta: ['board_id'],
    default_content_type: 'pinterest_pin',
    content_types: [
      {
        value: 'pinterest_pin',
        label: 'Pin',
        requires_media: true,
        accept_images: true,
        accept_videos: false,
        accept_documents: false,
        max_media_count: 1,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: null,
      },
      {
        value: 'pinterest_video_pin',
        label: 'Video Pin',
        requires_media: true,
        accept_images: false,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 1,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 900,
      },
      {
        value: 'pinterest_carousel',
        label: 'Carousel',
        requires_media: true,
        accept_images: true,
        accept_videos: false,
        accept_documents: false,
        max_media_count: 5,
        min_media_count: 2,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
  bluesky: {
    platform: 'bluesky',
    label: 'Bluesky',
    max_content_length: 300,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'bluesky_post',
    content_types: [
      {
        value: 'bluesky_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 4,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: 600,
      },
    ],
  },
  mastodon: {
    platform: 'mastodon',
    label: 'Mastodon',
    max_content_length: 500,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'mastodon_post',
    content_types: [
      {
        value: 'mastodon_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 4,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
  telegram: {
    platform: 'telegram',
    label: 'Telegram',
    max_content_length: 4096,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'telegram_post',
    content_types: [
      {
        value: 'telegram_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 10,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
  discord: {
    platform: 'discord',
    label: 'Discord',
    max_content_length: 2000,
    max_hashtags: null,
    required_meta: ['channel_id'],
    default_content_type: 'discord_message',
    content_types: [
      {
        value: 'discord_message',
        label: 'Message',
        requires_media: false,
        accept_images: true,
        accept_videos: true,
        accept_documents: false,
        max_media_count: 10,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
  google_business: {
    platform: 'google_business',
    label: 'Google Business',
    max_content_length: 1500,
    max_hashtags: null,
    required_meta: [],
    default_content_type: 'google_business_post',
    content_types: [
      {
        value: 'google_business_post',
        label: 'Post',
        requires_media: false,
        accept_images: true,
        accept_videos: false,
        accept_documents: false,
        max_media_count: 1,
        min_media_count: 0,
        captionless: false,
        max_video_duration_sec: null,
      },
    ],
  },
}

export const TIKTOK_PRIVACY_OPTIONS = [
  { value: 'PUBLIC_TO_EVERYONE', label: 'Public' },
  { value: 'MUTUAL_FOLLOW_FRIENDS', label: 'Friends' },
  { value: 'FOLLOWER_OF_CREATOR', label: 'Followers' },
  { value: 'SELF_ONLY', label: 'Only me' },
] as const

export function getPlatformRules(platform: string): TryPostPlatformRules {
  return (
    TRYPOST_PLATFORM_RULES[platform] ?? {
      platform,
      label: platform,
      max_content_length: 2200,
      max_hashtags: null,
      required_meta: [],
      default_content_type: '',
      content_types: [
        {
          value: '',
          label: 'Post',
          requires_media: false,
          accept_images: true,
          accept_videos: true,
          accept_documents: false,
          max_media_count: 10,
          min_media_count: 0,
          captionless: false,
          max_video_duration_sec: null,
        },
      ],
    }
  )
}

export function getContentTypeRule(
  platform: string,
  contentType: string
): TryPostContentTypeRule | undefined {
  const rules = getPlatformRules(platform)
  return rules.content_types.find((t) => t.value === contentType) ?? rules.content_types[0]
}

export function defaultContentTypeForPlatform(
  platform: string,
  mediaKinds: Array<'image' | 'video' | 'document' | 'other'>
): string {
  const rules = getPlatformRules(platform)
  if (platform === 'tiktok') {
    const onlyImages = mediaKinds.length > 0 && mediaKinds.every((k) => k === 'image')
    return onlyImages ? 'tiktok_photo' : 'tiktok_video'
  }
  if (platform === 'pinterest') {
    const hasVideo = mediaKinds.includes('video')
    const imageCount = mediaKinds.filter((k) => k === 'image').length
    if (hasVideo) return 'pinterest_video_pin'
    if (imageCount >= 2) return 'pinterest_carousel'
    return 'pinterest_pin'
  }
  return rules.default_content_type
}

export function countHashtags(text: string): number {
  const matches = text.match(/(^|\s)#\w+/g)
  return matches?.length ?? 0
}

export type ComposerIssue = {
  message: string
  severity: 'warning' | 'error'
}

export function collectDestinationIssues(input: {
  platform: string
  content: string
  contentType: string
  mediaCount: number
  mediaKinds: Array<'image' | 'video' | 'document' | 'other'>
  meta: Record<string, unknown>
  accountMaxLength?: number
  /** When true, media/required-meta block scheduling (not drafts). */
  forPublish: boolean
}): ComposerIssue[] {
  const issues: ComposerIssue[] = []
  const rules = getPlatformRules(input.platform)
  const typeRule = getContentTypeRule(input.platform, input.contentType)
  const maxLen = input.accountMaxLength || rules.max_content_length
  const caption = typeRule?.captionless ? '' : input.content

  if (!typeRule?.captionless && caption.length > maxLen) {
    issues.push({
      message: `Caption is ${caption.length - maxLen} characters over the limit.`,
      severity: 'error',
    })
  }

  if (rules.max_hashtags != null && countHashtags(caption) > rules.max_hashtags) {
    issues.push({
      message: `Too many hashtags (max ${rules.max_hashtags}).`,
      severity: 'error',
    })
  }

  if (typeRule?.requires_media && input.mediaCount === 0) {
    issues.push({
      message: 'Please include an image or video.',
      severity: 'warning',
    })
  }

  if (typeRule && input.mediaCount > typeRule.max_media_count) {
    issues.push({
      message: `Too many media items (max ${typeRule.max_media_count}).`,
      severity: 'error',
    })
  }

  if (typeRule && input.mediaCount > 0 && input.mediaCount < typeRule.min_media_count) {
    issues.push({
      message: `Add at least ${typeRule.min_media_count} media items.`,
      severity: 'error',
    })
  }

  if (typeRule && input.mediaKinds.length) {
    const badImage = input.mediaKinds.some((k) => k === 'image') && !typeRule.accept_images
    const badVideo = input.mediaKinds.some((k) => k === 'video') && !typeRule.accept_videos
    if (badImage || badVideo) {
      issues.push({
        message: `Media type is not allowed for ${typeRule.label}.`,
        severity: 'error',
      })
    }
  }

  if (input.platform === 'tiktok' && input.forPublish && !input.meta.privacy_level) {
    issues.push({
      message: 'TikTok privacy level is required when publishing.',
      severity: 'error',
    })
  }

  if (input.platform === 'pinterest' && input.forPublish && !input.meta.board_id) {
    issues.push({
      message: 'Pinterest board is required when publishing.',
      severity: 'error',
    })
  }

  if (input.platform === 'discord' && input.forPublish && !input.meta.channel_id) {
    issues.push({
      message: 'Discord channel is required when publishing.',
      severity: 'error',
    })
  }

  if (
    input.platform === 'youtube' &&
    input.forPublish &&
    !String(input.meta.title ?? '').trim() &&
    !caption.trim()
  ) {
    issues.push({
      message: 'YouTube needs a title or caption.',
      severity: 'error',
    })
  }

  if (
    input.forPublish &&
    !caption.trim() &&
    input.mediaCount === 0 &&
    !typeRule?.captionless
  ) {
    issues.push({
      message: 'Add a caption or media.',
      severity: 'error',
    })
  }

  return issues
}
