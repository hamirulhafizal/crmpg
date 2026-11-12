/** All networks TryPost can connect — keep in sync with TryPost Platform enum. */
export const TRYPOST_SUPPORTED_PLATFORMS = [
  'instagram',
  'instagram-facebook',
  'facebook',
  'tiktok',
  'youtube',
  'linkedin',
  'linkedin-page',
  'x',
  'threads',
  'pinterest',
  'bluesky',
  'mastodon',
  'telegram',
  'discord',
  'google_business',
] as const

/** TryPost web app — OAuth for channels only runs there (API cannot connect accounts). */
export const TRYPOST_APP_URL = 'https://app.trypost.it'
export const TRYPOST_CONNECT_CHANNEL_URL = `${TRYPOST_APP_URL}/settings/channels`

export type ConnectableNetwork = {
  id: string
  /** Primary platform key(s) synced from TryPost for this card */
  platforms: readonly string[]
  label: string
  subtitle: string
  short: string
  badgeClassName: string
}

/** Catalog shown in “Connect a new channel” — mirrors TryPost’s picker cards. */
export const TRYPOST_CONNECTABLE_NETWORKS: readonly ConnectableNetwork[] = [
  {
    id: 'bluesky',
    platforms: ['bluesky'],
    label: 'Bluesky',
    subtitle: 'Profile',
    short: 'BS',
    badgeClassName: 'bg-[#0085FF]',
  },
  {
    id: 'discord',
    platforms: ['discord'],
    label: 'Discord',
    subtitle: 'Server',
    short: 'DC',
    badgeClassName: 'bg-[#5865F2]',
  },
  {
    id: 'facebook',
    platforms: ['facebook'],
    label: 'Facebook Page',
    subtitle: 'Page',
    short: 'f',
    badgeClassName: 'bg-[#1877F2]',
  },
  {
    id: 'google_business',
    platforms: ['google_business'],
    label: 'Google Business Profile',
    subtitle: 'Business profile',
    short: 'G',
    badgeClassName: 'bg-gradient-to-br from-blue-500 via-emerald-500 to-amber-400',
  },
  {
    id: 'instagram',
    platforms: ['instagram', 'instagram-facebook'],
    label: 'Instagram',
    subtitle: 'Business, Creator or Personal',
    short: 'IG',
    badgeClassName: 'bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400',
  },
  {
    id: 'linkedin',
    platforms: ['linkedin', 'linkedin-page'],
    label: 'LinkedIn',
    subtitle: 'Page or Profile',
    short: 'in',
    badgeClassName: 'bg-[#0A66C2]',
  },
  {
    id: 'mastodon',
    platforms: ['mastodon'],
    label: 'Mastodon',
    subtitle: 'Profile',
    short: 'M',
    badgeClassName: 'bg-[#6364FF]',
  },
  {
    id: 'pinterest',
    platforms: ['pinterest'],
    label: 'Pinterest',
    subtitle: 'Profile',
    short: 'P',
    badgeClassName: 'bg-[#E60023]',
  },
  {
    id: 'telegram',
    platforms: ['telegram'],
    label: 'Telegram',
    subtitle: 'Channel or group',
    short: 'TG',
    badgeClassName: 'bg-[#2AABEE]',
  },
  {
    id: 'threads',
    platforms: ['threads'],
    label: 'Threads',
    subtitle: 'Profile',
    short: 'Th',
    badgeClassName: 'bg-zinc-900 text-white ring-1 ring-white/20',
  },
  {
    id: 'tiktok',
    platforms: ['tiktok'],
    label: 'TikTok',
    subtitle: 'Business or Personal',
    short: 'TT',
    badgeClassName: 'bg-gradient-to-br from-slate-100 via-white to-cyan-300 text-black',
  },
  {
    id: 'x',
    platforms: ['x'],
    label: 'X',
    subtitle: 'Profile',
    short: 'X',
    badgeClassName: 'bg-black text-white ring-1 ring-white/20',
  },
  {
    id: 'youtube',
    platforms: ['youtube'],
    label: 'YouTube',
    subtitle: 'Channel',
    short: 'YT',
    badgeClassName: 'bg-gradient-to-br from-rose-500 to-red-700',
  },
] as const

export type TryPostSupportedPlatform = (typeof TRYPOST_SUPPORTED_PLATFORMS)[number]

export type PlatformVisual = {
  label: string
  short: string
  /** Tailwind classes for solid/gradient badge backgrounds */
  badgeClassName: string
  chipClassName: string
}

const PLATFORM_VISUALS: Record<string, PlatformVisual> = {
  instagram: {
    label: 'Instagram',
    short: 'IG',
    badgeClassName: 'bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400',
    chipClassName: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200',
  },
  'instagram-facebook': {
    label: 'Instagram',
    short: 'IG',
    badgeClassName: 'bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400',
    chipClassName: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-200',
  },
  facebook: {
    label: 'Facebook',
    short: 'f',
    badgeClassName: 'bg-[#1877F2]',
    chipClassName: 'bg-sky-100 text-sky-800 ring-sky-200',
  },
  tiktok: {
    label: 'TikTok',
    short: 'TT',
    badgeClassName: 'bg-gradient-to-br from-slate-100 via-white to-cyan-300 text-black',
    chipClassName: 'bg-slate-100 text-slate-800 ring-slate-200',
  },
  youtube: {
    label: 'YouTube',
    short: 'YT',
    badgeClassName: 'bg-gradient-to-br from-rose-500 to-red-700',
    chipClassName: 'bg-rose-100 text-rose-800 ring-rose-200',
  },
  linkedin: {
    label: 'LinkedIn',
    short: 'in',
    badgeClassName: 'bg-[#0A66C2]',
    chipClassName: 'bg-blue-100 text-blue-800 ring-blue-200',
  },
  'linkedin-page': {
    label: 'LinkedIn Page',
    short: 'in',
    badgeClassName: 'bg-[#0A66C2]',
    chipClassName: 'bg-blue-100 text-blue-800 ring-blue-200',
  },
  x: {
    label: 'X',
    short: 'X',
    badgeClassName: 'bg-black text-white ring-1 ring-white/20',
    chipClassName: 'bg-slate-900 text-white ring-slate-700',
  },
  threads: {
    label: 'Threads',
    short: 'Th',
    badgeClassName: 'bg-zinc-900 text-white ring-1 ring-white/20',
    chipClassName: 'bg-zinc-100 text-zinc-800 ring-zinc-200',
  },
  pinterest: {
    label: 'Pinterest',
    short: 'P',
    badgeClassName: 'bg-[#E60023]',
    chipClassName: 'bg-rose-100 text-rose-800 ring-rose-200',
  },
  bluesky: {
    label: 'Bluesky',
    short: 'BS',
    badgeClassName: 'bg-[#0085FF]',
    chipClassName: 'bg-sky-100 text-sky-800 ring-sky-200',
  },
  mastodon: {
    label: 'Mastodon',
    short: 'M',
    badgeClassName: 'bg-[#6364FF]',
    chipClassName: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  },
  telegram: {
    label: 'Telegram',
    short: 'TG',
    badgeClassName: 'bg-[#2AABEE]',
    chipClassName: 'bg-sky-100 text-sky-800 ring-sky-200',
  },
  discord: {
    label: 'Discord',
    short: 'DC',
    badgeClassName: 'bg-[#5865F2]',
    chipClassName: 'bg-indigo-100 text-indigo-800 ring-indigo-200',
  },
  google_business: {
    label: 'Google Business',
    short: 'G',
    badgeClassName: 'bg-gradient-to-br from-blue-500 via-emerald-500 to-amber-400',
    chipClassName: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
}

export function isSupportedTryPostPlatform(platform: string): platform is TryPostSupportedPlatform {
  return (TRYPOST_SUPPORTED_PLATFORMS as readonly string[]).includes(platform)
}

export function platformVisual(platform: string): PlatformVisual {
  return (
    PLATFORM_VISUALS[platform] ?? {
      label: platform || 'Channel',
      short: (platform || '?').slice(0, 2).toUpperCase(),
      badgeClassName: 'bg-white/20',
      chipClassName: 'bg-slate-100 text-slate-700 ring-slate-200',
    }
  )
}

export function platformLabel(platform: string): string {
  return platformVisual(platform).label
}

export function platformShort(platform: string): string {
  return platformVisual(platform).short
}

/** Public path for platform badge images (mirrors TryPost /images/accounts/*.png). */
export function platformIconSrc(platform: string): string {
  const key = platform === 'instagram-facebook' ? 'instagram' : platform === 'linkedin-page' ? 'linkedin' : platform
  const known = new Set([
    'instagram',
    'facebook',
    'tiktok',
    'youtube',
    'linkedin',
    'x',
    'threads',
    'pinterest',
    'bluesky',
    'mastodon',
    'telegram',
    'discord',
    'google_business',
  ])
  const file = known.has(key) ? key : 'generic'
  return `/images/accounts/${file}.png`
}
