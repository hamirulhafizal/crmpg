'use client'

import { useState } from 'react'

import type { TryPostSocialAccount } from '@/app/lib/trypost/types'
import { platformIconSrc, platformLabel, platformShort, platformVisual } from '@/app/lib/trypost/platforms'

function channelInitials(ch: TryPostSocialAccount): string {
  const raw = (ch.display_name || ch.username || '?').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

type Size = 'sm' | 'md' | 'lg'

const AVATAR_SIZE: Record<Size, string> = {
  sm: 'size-9 text-[10px]',
  md: 'size-10 text-xs',
  lg: 'size-11 text-xs',
}

const BADGE_PX: Record<Size, number> = {
  sm: 18,
  md: 22,
  lg: 22,
}

export function PlatformBadgeIcon({
  platform,
  size = 22,
  className = '',
  rounded = 'full',
}: {
  platform: string
  size?: number
  className?: string
  rounded?: 'full' | 'lg'
}) {
  const [failed, setFailed] = useState(false)
  const visual = platformVisual(platform)
  const radius = rounded === 'full' ? 'rounded-full' : 'rounded-lg'

  if (failed) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden border border-[#141416] bg-[#141416] text-[8px] font-bold text-white ${radius} ${visual.badgeClassName} ${className}`}
        style={{ width: size, height: size }}
        title={visual.label}
      >
        {platformShort(platform)}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden border border-[#141416] bg-[#141416] ${radius} ${className}`}
      style={{ width: size, height: size }}
      title={platformLabel(platform)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={platformIconSrc(platform)}
        alt={platformLabel(platform)}
        className={`size-full object-cover ${radius}`}
        loading="lazy"
        onError={() => setFailed(true)}
      />
    </span>
  )
}

export function SocialAccountAvatar({
  channel,
  size = 'md',
  selected = false,
  showBadge = true,
}: {
  channel: TryPostSocialAccount
  size?: Size
  selected?: boolean
  showBadge?: boolean
}) {
  const [imgFailed, setImgFailed] = useState(false)
  const avatarUrl = channel.avatar_url?.trim() || ''
  const showImage = Boolean(avatarUrl) && !imgFailed
  const badgeSize = BADGE_PX[size]

  return (
    <span className="relative inline-flex shrink-0 align-top">
      <span
        className={`relative flex shrink-0 overflow-hidden rounded-xl ${AVATAR_SIZE[size]} ${
          selected ? 'ring-2 ring-[#7c5cff] ring-offset-2 ring-offset-[#141416]' : ''
        } ${showImage ? 'bg-[#1c1c1f]' : 'bg-gradient-to-br from-amber-300 to-yellow-500 font-bold text-slate-900'}`}
      >
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={channel.display_name || channel.username || 'Account'}
            className="aspect-square size-full object-cover"
            loading="lazy"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <span className="flex size-full items-center justify-center">{channelInitials(channel)}</span>
        )}
      </span>
      {showBadge && (
        <PlatformBadgeIcon
          platform={channel.platform}
          size={badgeSize}
          className="absolute -bottom-1 -end-2"
        />
      )}
    </span>
  )
}

export function PlatformLogoMark({
  platform,
  size = 24,
}: {
  platform: string
  size?: number
}) {
  return <PlatformBadgeIcon platform={platform} size={size} rounded="lg" className="border-0" />
}
