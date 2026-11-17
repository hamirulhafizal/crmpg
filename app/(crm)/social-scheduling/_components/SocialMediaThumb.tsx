'use client'

import { useEffect, useState } from 'react'

type Props = {
  url: string | null | undefined
  thumbUrl?: string | null
  mediaType?: string | null
  alt?: string
  className?: string
  sizeClassName?: string
  showVideoBadge?: boolean
  onOpen?: () => void
}

function isVideoUrl(url: string) {
  return /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)
}

function isVideoMedia(url: string | null | undefined, mediaType?: string | null) {
  if ((mediaType || '').toLowerCase().includes('video')) return true
  return Boolean(url && isVideoUrl(url))
}

type Mode = 'thumb' | 'video' | 'fallback'

function resolveMode(input: {
  url?: string | null
  thumbUrl?: string | null
  mediaType?: string | null
}): Mode {
  const poster = (input.thumbUrl || '').trim()
  const file = (input.url || '').trim()
  const video = isVideoMedia(file || poster, input.mediaType)
  if (poster && !isVideoUrl(poster)) return 'thumb'
  if (file && video) return 'video'
  if (file) return 'thumb'
  return 'fallback'
}

/** Reliable image/video thumbnail for R2 + Telegram imports. */
export function SocialMediaThumb({
  url,
  thumbUrl,
  mediaType,
  alt = '',
  className = '',
  sizeClassName = 'h-20 w-20',
  showVideoBadge = true,
  onOpen,
}: Props) {
  const video = isVideoMedia(url, mediaType)
  const poster = (thumbUrl || '').trim()
  const file = (url || '').trim()
  const [mode, setMode] = useState<Mode>(() => resolveMode({ url, thumbUrl, mediaType }))

  useEffect(() => {
    setMode(resolveMode({ url, thumbUrl, mediaType }))
  }, [url, thumbUrl, mediaType])

  // Prefer plain URL for preview frame — `#t=` breaks some R2/Safari combos.
  const videoSrc = file
  const imageSrc = poster && !isVideoUrl(poster) ? poster : file && !isVideoUrl(file) ? file : ''

  const inner = (
    <>
      {mode === 'thumb' && imageSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={imageSrc}
          src={imageSrc}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover"
          loading="lazy"
          onError={() => {
            if (file && video) setMode('video')
            else setMode('fallback')
          }}
        />
      ) : null}

      {mode === 'video' && file ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          key={videoSrc}
          src={videoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          playsInline
          muted
          preload="metadata"
          onLoadedData={(e) => {
            try {
              const el = e.currentTarget
              if (el.currentTime < 0.05 && Number.isFinite(el.duration) && el.duration > 0.2) {
                el.currentTime = 0.15
              }
            } catch {
              // ignore
            }
          }}
          onError={() => setMode('fallback')}
        />
      ) : null}

      {mode === 'fallback' ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-amber-900/35 via-[#1c1c1f] to-[#141416] px-1 text-center">
          <svg
            className="h-6 w-6 text-amber-400/80"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9zm3.2 1.2a1 1 0 0 0-.8 1.6l2.7 3.6a1 1 0 0 0 1.5.1l2-2.1 2.4 2.9a1 1 0 0 0 1.6-.1l2.1-2.8a1 1 0 0 0-.8-1.6H7.2z" />
          </svg>
          <span className="text-[9px] font-semibold uppercase tracking-wide text-white/45">
            {video ? 'Video' : 'Media'}
          </span>
        </div>
      ) : null}

      {showVideoBadge && video ? (
        <>
          <span className="absolute bottom-1 left-1 z-[1] rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold text-white">
            VIDEO
          </span>
          <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
            <span className="flex size-7 items-center justify-center rounded-full bg-black/55 text-white shadow">
              <svg className="h-3.5 w-3.5 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z" />
              </svg>
            </span>
          </span>
        </>
      ) : null}
    </>
  )

  if (onOpen && file) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`relative shrink-0 overflow-hidden rounded-lg bg-[#1c1c1f] ring-offset-2 ring-offset-[#141416] transition hover:ring-2 hover:ring-[#7c5cff]/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c5cff] ${sizeClassName} ${className}`}
        aria-label={video ? 'Play video preview' : 'Open image preview'}
      >
        {inner}
      </button>
    )
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-lg bg-[#1c1c1f] ${sizeClassName} ${className}`}
    >
      {inner}
    </div>
  )
}
