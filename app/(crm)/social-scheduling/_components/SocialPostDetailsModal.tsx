'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { SocialCalendarEvent } from '@/app/lib/trypost/types'
import {
  formatTimeInZone,
  platformLabel,
  platformShort,
  platformVisual,
} from '@/app/lib/trypost/calendar-shared'

type DetailPayload = {
  post: {
    id: string
    content: string | null
    status: string | null
    publishStatus: string | null
    platform: string | null
    contentType: string | null
    scheduledAt: string | null
    publishedAt: string | null
    platformUrl: string | null
    displayName: string | null
    displayUsername: string | null
    displayAvatar: string | null
    mediaUrl: string | null
    mediaKind: 'image' | 'video' | null
    mediaCount: number
    errorMessage: string | null
  }
  metrics: {
    views: number | null
    reach: number | null
    engagementRate: number | null
    reactions: number | null
    comments: number | null
    unsupportedReason: string | null
  } | null
}

type Props = {
  open: boolean
  event: SocialCalendarEvent | null
  timeZone?: string
  onClose: () => void
}

function formatWhen(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return ''
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(iso.trim())
    ? `${iso.trim().replace(' ', 'T')}Z`
    : iso
  const d = new Date(normalized)
  if (Number.isNaN(d.getTime())) return iso
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d)
}

function PlatformGlyph({ platform }: { platform: string }) {
  const visual = platformVisual(platform)
  return (
    <span
      className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ring-2 ring-[#1c1c1f] ${visual.badgeClassName}`}
      title={visual.label}
    >
      {platformShort(platform)}
    </span>
  )
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase()
  const published = s === 'published'
  const failed = s === 'failed'
  const scheduled = s === 'scheduled' || s === 'pending_approval'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
        published
          ? 'bg-emerald-500/15 text-emerald-300'
          : failed
            ? 'bg-rose-500/15 text-rose-300'
            : scheduled
              ? 'bg-amber-500/15 text-amber-200'
              : 'bg-white/10 text-white/70'
      }`}
    >
      {published ? '✓' : failed ? '!' : '•'} {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

function formatMetric(value: number | null, asPercent = false): string {
  if (value == null) return '—'
  if (asPercent) {
    const pct = value <= 1 ? value * 100 : value
    return `${Math.round(pct * 10) / 10}%`
  }
  if (value >= 1000) return `${Math.round((value / 1000) * 10) / 10}k`
  return String(Math.round(value))
}

export function SocialPostDetailsModal({
  open,
  event,
  timeZone = 'UTC',
  onClose,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailPayload | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open || !event) {
      setDetail(null)
      setError(null)
      return
    }

    const postId = event.trypostPostId
    if (!postId) {
      setDetail({
        post: {
          id: event.id,
          content: event.content,
          status: event.status,
          publishStatus: event.status,
          platform: event.platform,
          contentType: null,
          scheduledAt: event.kind === 'scheduled' ? event.at : null,
          publishedAt: event.kind === 'published' ? event.at : null,
          platformUrl: null,
          displayName: event.channelDisplayName,
          displayUsername: event.channelUsername,
          displayAvatar: event.channelAvatarUrl,
          mediaUrl: event.mediaThumbUrl,
          mediaKind: event.mediaThumbKind,
          mediaCount: event.mediaCount,
          errorMessage: null,
        },
        metrics: null,
      })
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const res = await adminFetch(
          `/api/social-scheduling/posts/detail?id=${encodeURIComponent(postId)}`
        )
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load post')
        if (!cancelled) setDetail(json as DetailPayload)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load post')
          setDetail({
            post: {
              id: postId,
              content: event.content,
              status: event.status,
              publishStatus: event.status,
              platform: event.platform,
              contentType: null,
              scheduledAt: event.kind === 'scheduled' ? event.at : null,
              publishedAt: event.kind === 'published' ? event.at : null,
              platformUrl: null,
              displayName: event.channelDisplayName,
              displayUsername: event.channelUsername,
              displayAvatar: event.channelAvatarUrl,
              mediaUrl: event.mediaThumbUrl,
              mediaKind: event.mediaThumbKind,
              mediaCount: event.mediaCount,
              errorMessage: null,
            },
            metrics: null,
          })
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, event])

  if (!mounted) return null

  const post = detail?.post
  const platform = post?.platform || event?.platform || ''
  const status = String(post?.publishStatus || post?.status || event?.status || 'unknown')
  const whenIso = post?.publishedAt || post?.scheduledAt || event?.at || null
  const whenLabel = whenIso
    ? `${status.toLowerCase() === 'published' ? 'Published' : status.toLowerCase() === 'scheduled' ? 'Scheduled' : 'Activity'} on ${formatWhen(whenIso, timeZone)}`
    : formatTimeInZone(event?.at || new Date().toISOString(), timeZone)
  const mediaUrl = post?.mediaUrl || event?.mediaThumbUrl
  const mediaKind = post?.mediaKind || event?.mediaThumbKind
  const isVideo =
    mediaKind === 'video' || (!!mediaUrl && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(mediaUrl))

  return createPortal(
    <AnimatePresence>
      {open && event && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="post-details-title"
            className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1e] text-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
              <h2 id="post-details-title" className="text-base font-semibold">
                Post Details
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="rounded-lg p-1.5 text-white/55 hover:bg-white/5 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="space-y-4 px-4 pb-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={status} />
                <p className="text-xs text-white/45">{whenLabel}</p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  {post?.displayAvatar || event.channelAvatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={post?.displayAvatar || event.channelAvatarUrl || ''}
                      alt=""
                      className="h-11 w-11 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-xs font-semibold">
                      {(post?.displayUsername || event.channelUsername || '?')
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  )}
                  {platform && <PlatformGlyph platform={platform} />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {post?.displayName || event.channelDisplayName || 'Channel'}
                  </p>
                  <p className="truncate text-xs text-white/45">
                    @{post?.displayUsername || event.channelUsername || 'channel'}
                  </p>
                </div>
              </div>

              <div>
                <p className="whitespace-pre-wrap text-sm text-white/80">
                  {post?.content?.trim() || event.content?.trim() || (
                    <span className="text-white/40">No content</span>
                  )}
                </p>

                {mediaUrl && (
                  <div className="relative mt-3 aspect-square w-full max-w-[220px] overflow-hidden rounded-xl bg-black/40">
                    {isVideo ? (
                      <video
                        src={mediaUrl.includes('#') ? mediaUrl : `${mediaUrl}#t=0.1`}
                        className="h-full w-full object-cover"
                        playsInline
                        muted
                        preload="metadata"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                    )}
                    {isVideo && (
                      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <span className="rounded-full bg-black/55 p-3 text-white">
                          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z" />
                          </svg>
                        </span>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {loading && (
                <p className="text-xs text-white/40">Loading analytics…</p>
              )}
              {error && !loading && (
                <p className="text-xs text-amber-300/90">{error}</p>
              )}

              <div className="flex flex-wrap items-center gap-4 border-t border-white/10 pt-3 text-xs text-white/70">
                <span className="inline-flex items-center gap-1.5" title="Views">
                  <svg className="h-4 w-4 text-white/45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  {formatMetric(detail?.metrics?.views ?? null)}
                </span>
                <span className="inline-flex items-center gap-1.5" title="Reach">
                  <svg className="h-4 w-4 text-white/45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="3" strokeWidth={2} />
                    <circle cx="12" cy="12" r="7" strokeWidth={2} />
                  </svg>
                  {formatMetric(detail?.metrics?.reach ?? null)}
                </span>
                <span className="inline-flex items-center gap-1.5" title="Engagement rate">
                  <svg className="h-4 w-4 text-white/45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l6-6 4 4 8-8" />
                  </svg>
                  {formatMetric(detail?.metrics?.engagementRate ?? null, true)}
                </span>
              </div>
            </div>

            <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-[#141418] px-4 py-3">
              <p className="inline-flex items-center gap-2 text-xs text-white/45">
                {platform && (
                  <span
                    className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold text-white ${platformVisual(platform).badgeClassName}`}
                    title={platformLabel(platform)}
                  >
                    {platformShort(platform)}
                  </span>
                )}
                <span>Published via {platform ? platformLabel(platform) : 'network'}</span>
              </p>
              <div className="flex items-center gap-2">
                {post?.platformUrl ? (
                  <a
                    href={String(post.platformUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-white/85 hover:bg-white/5"
                  >
                    View post
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <span className="rounded-lg border border-white/5 px-3 py-1.5 text-xs text-white/30">
                    View post
                  </span>
                )}
              </div>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
