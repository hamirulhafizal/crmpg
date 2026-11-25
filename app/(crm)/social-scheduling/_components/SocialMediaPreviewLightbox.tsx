'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'

type Props = {
  open: boolean
  url: string | null
  thumbUrl?: string | null
  mediaType?: string | null
  title?: string | null
  caption?: string | null
  onClose: () => void
}

type LoadPhase = 'idle' | 'loading' | 'ready' | 'buffering' | 'error'

function isVideo(url: string | null | undefined, mediaType?: string | null) {
  if ((mediaType || '').toLowerCase().includes('video')) return true
  return Boolean(url && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url))
}

/** Videos we store ourselves are normalized at upload — play directly. */
function isPipelineNormalizedHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return (
      host.endsWith('.r2.dev') ||
      host.endsWith('.r2.cloudflarestorage.com') ||
      host.endsWith('.publicgolds.com') ||
      host === 'localhost' ||
      host.endsWith('.localhost')
    )
  } catch {
    return false
  }
}

function filenameFromUrl(url: string, fallback: string) {
  try {
    const path = new URL(url).pathname
    const base = path.split('/').pop() || ''
    if (base && /\.[a-z0-9]{2,5}$/i.test(base)) return decodeURIComponent(base)
  } catch {
    /* ignore */
  }
  return fallback
}

async function downloadMediaFile(url: string, filename: string) {
  const triggerBlob = (blob: Blob) => {
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
  }

  try {
    const proxy = `/api/social-scheduling/media/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`
    const res = await adminFetch(proxy)
    if (res.ok) {
      triggerBlob(await res.blob())
      return
    }
  } catch {
    /* try next */
  }

  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    triggerBlob(await res.blob())
    return
  } catch {
    /* try next */
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

function LoadingOverlay({ label }: { label: string }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg bg-black/65">
      <span
        className="h-10 w-10 animate-spin rounded-full border-[3px] border-white/20 border-t-[#a78bfa]"
        aria-hidden
      />
      <p className="px-4 text-center text-sm font-medium text-white/90">{label}</p>
      <p className="px-6 text-center text-[11px] text-white/45">
        Preparing a browser-safe copy (Chrome often freezes on the original export)
      </p>
    </div>
  )
}

export function SocialMediaPreviewLightbox({
  open,
  url,
  thumbUrl,
  mediaType,
  title,
  caption,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const stuckTimerRef = useRef<number | null>(null)
  const video = isVideo(url, mediaType)

  const [objectUrl, setObjectUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [ended, setEnded] = useState(false)
  const [phase, setPhase] = useState<LoadPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Loading video…')

  const previewApiUrl = useMemo(() => {
    if (!url || !video) return null
    return `/api/social-scheduling/media/preview?url=${encodeURIComponent(url)}`
  }, [url, video])

  // Pipeline-normalized R2 videos play directly. External/legacy CDN files still convert.
  useEffect(() => {
    if (!open || !url) {
      setObjectUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return null
      })
      setPhase('idle')
      setPlaying(false)
      setEnded(false)
      setError(null)
      return
    }

    if (!video) {
      setObjectUrl(url)
      setPhase('ready')
      return
    }

    // New uploads / Telegram / paste-link land as browser-safe H.264 on our CDN.
    if (isPipelineNormalizedHost(url) || !previewApiUrl) {
      setObjectUrl((prev) => {
        if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
        return url
      })
      setPhase('ready')
      setError(null)
      return
    }

    let cancelled = false
    let created: string | null = null
    setPhase('loading')
    setStatusLabel('Converting for browser playback…')
    setPlaying(false)
    setEnded(false)
    setError(null)
    setObjectUrl((prev) => {
      if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
      return null
    })

    ;(async () => {
      try {
        const res = await adminFetch(previewApiUrl)
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as { error?: string }))
          throw new Error(
            typeof body.error === 'string' ? body.error : `Preview failed (${res.status})`
          )
        }
        if (cancelled) return
        setStatusLabel('Loading player…')
        const blob = await res.blob()
        if (cancelled) return
        const headerType = res.headers.get('content-type') || blob.type || ''
        const mime = headerType.startsWith('video/')
          ? headerType.split(';')[0]!.trim()
          : blob.type.startsWith('video/')
            ? blob.type
            : 'video/webm'
        const typed = blob.type === mime ? blob : new Blob([blob], { type: mime })
        created = URL.createObjectURL(typed)
        setObjectUrl(created)
        setPhase('ready')
      } catch (e) {
        if (cancelled) return
        console.warn('[media-preview] chrome-safe preview failed:', e)
        setObjectUrl(null)
        setPhase('error')
        setError(
          e instanceof Error
            ? `${e.message} Use Download (works in Safari/QuickTime).`
            : 'Could not prepare Chrome preview. Use Download instead.'
        )
      }
    })()

    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
      if (stuckTimerRef.current) {
        window.clearInterval(stuckTimerRef.current)
        stuckTimerRef.current = null
      }
    }
  }, [open, url, video, previewApiUrl])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === ' ' && video) {
        e.preventDefault()
        void togglePlay()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, video, objectUrl])

  const clearStuckWatch = () => {
    if (stuckTimerRef.current) {
      window.clearInterval(stuckTimerRef.current)
      stuckTimerRef.current = null
    }
  }

  const watchForStuck = () => {
    clearStuckWatch()
    const el = videoRef.current
    if (!el) return
    const start = el.currentTime
    let ticks = 0
    stuckTimerRef.current = window.setInterval(() => {
      ticks += 1
      const node = videoRef.current
      if (!node || node.paused) {
        clearStuckWatch()
        return
      }
      if (node.currentTime > start + 0.15) {
        clearStuckWatch()
        setPlaying(true)
        setPhase('ready')
        return
      }
      // ~2s with no progress → stuck on first frame (legacy asset). Try convert once.
      if (ticks >= 8) {
        clearStuckWatch()
        node.pause()
        setPlaying(false)
        if (previewApiUrl && objectUrl === url) {
          setPhase('loading')
          setStatusLabel('Converting for browser playback…')
          void (async () => {
            try {
              const res = await adminFetch(previewApiUrl)
              if (!res.ok) throw new Error(`Preview failed (${res.status})`)
              const blob = await res.blob()
              const headerType = res.headers.get('content-type') || blob.type || ''
              const mime = headerType.startsWith('video/')
                ? headerType.split(';')[0]!.trim()
                : 'video/webm'
              const typed = new Blob([blob], { type: mime })
              const created = URL.createObjectURL(typed)
              setObjectUrl((prev) => {
                if (prev?.startsWith('blob:')) URL.revokeObjectURL(prev)
                return created
              })
              setPhase('ready')
              setError(null)
            } catch (e) {
              setPhase('error')
              setError(
                e instanceof Error
                  ? e.message
                  : 'Browser cannot play this older file. Use Download (QuickTime/Safari).'
              )
            }
          })()
          return
        }
        setPhase('error')
        setError(
          'Browser still cannot advance this video. Use Download (works in QuickTime) or Open original.'
        )
      }
    }, 250)
  }

  const ensureAudible = useCallback((el: HTMLVideoElement) => {
    el.defaultMuted = false
    el.muted = false
    el.volume = 1
    try {
      el.removeAttribute('muted')
    } catch {
      /* ignore */
    }
  }, [])

  const togglePlay = useCallback(async () => {
    const el = videoRef.current
    if (!el || !objectUrl) return
    setError(null)
    try {
      if (el.paused || el.ended) {
        if (el.ended || ended) {
          el.currentTime = 0
          setEnded(false)
        }
        setPhase('buffering')
        setStatusLabel('Starting playback…')
        ensureAudible(el)
        await el.play()
        // Chrome can re-mute after play() in some builds — force again.
        ensureAudible(el)
        watchForStuck()
      } else {
        clearStuckWatch()
        el.pause()
        setPlaying(false)
        setPhase('ready')
      }
    } catch (e) {
      clearStuckWatch()
      // Autoplay-with-sound blocked: retry muted, then unmute after play starts.
      const el2 = videoRef.current
      if (el2 && (e instanceof DOMException || (e instanceof Error && /interact|notallowed|user/i.test(e.message)))) {
        try {
          el2.muted = true
          await el2.play()
          ensureAudible(el2)
          watchForStuck()
          return
        } catch {
          /* fall through */
        }
      }
      setPlaying(false)
      setPhase('error')
      setError(e instanceof Error ? e.message : 'Could not play this video.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ended, objectUrl, ensureAudible])

  const handleDownload = async () => {
    if (!url) return
    setDownloading(true)
    try {
      const name = filenameFromUrl(
        url,
        video ? `${(title || 'video').replace(/[^\w.\-]+/g, '_').slice(0, 40)}.mp4` : 'media.jpg'
      )
      await downloadMediaFile(url, name)
    } finally {
      setDownloading(false)
    }
  }

  const showLoading =
    video && !error && (phase === 'loading' || phase === 'buffering' || !objectUrl)
  const showPlayOverlay =
    video && Boolean(objectUrl) && !error && !showLoading && (!playing || ended)

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open && url && (
        <motion.div
          className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 p-3 backdrop-blur-sm sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0" aria-label="Close preview" onClick={onClose} />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Media preview"
            className="relative z-10 flex max-h-[min(92dvh,900px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#101012] text-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {video ? 'Video preview' : 'Image preview'}
                </p>
                {title ? <p className="mt-0.5 truncate text-xs text-white/45">{title}</p> : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3 sm:p-4">
              {video ? (
                <div className="relative aspect-[9/16] max-h-[min(64dvh,680px)] w-full max-w-md bg-black">
                  {objectUrl ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      ref={videoRef}
                      key={objectUrl}
                      src={objectUrl}
                      poster={thumbUrl || undefined}
                      controls
                      playsInline
                      preload="auto"
                      className="h-full w-full rounded-lg bg-black object-contain"
                      onLoadedMetadata={() => {
                        const el = videoRef.current
                        if (!el) return
                        ensureAudible(el)
                      }}
                      onLoadedData={() => {
                        const el = videoRef.current
                        if (!el) return
                        ensureAudible(el)
                        if (phase !== 'buffering') setPhase('ready')
                      }}
                      onPlaying={() => {
                        const el = videoRef.current
                        if (el) ensureAudible(el)
                        setPlaying(true)
                        setEnded(false)
                        setPhase('ready')
                        setError(null)
                      }}
                      onTimeUpdate={() => {
                        const el = videoRef.current
                        if (el && !el.paused && el.currentTime > 0.2) {
                          setPlaying(true)
                          setPhase('ready')
                          clearStuckWatch()
                        }
                      }}
                      onPause={() => {
                        clearStuckWatch()
                        setPlaying(false)
                        if (phase !== 'error') setPhase('ready')
                      }}
                      onEnded={() => {
                        clearStuckWatch()
                        setPlaying(false)
                        setEnded(true)
                        setPhase('ready')
                      }}
                      onWaiting={() => setPhase('buffering')}
                      onError={() => {
                        clearStuckWatch()
                        setPlaying(false)
                        setPhase('error')
                        setError(
                          'Could not decode video in the browser. Download works in QuickTime — use Download below.'
                        )
                      }}
                    />
                  ) : (
                    <div className="h-full w-full rounded-lg bg-black" />
                  )}

                  {showLoading ? <LoadingOverlay label={statusLabel} /> : null}

                  {showPlayOverlay ? (
                    <button
                      type="button"
                      onClick={() => void togglePlay()}
                      className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-black/20 transition hover:bg-black/30"
                      aria-label={ended ? 'Replay video' : 'Play video'}
                    >
                      <span className="flex size-16 items-center justify-center rounded-full bg-[#7c5cff] text-white shadow-xl shadow-black/40 ring-4 ring-white/10">
                        {ended ? (
                          <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M16.023 9.348A8.25 8.25 0 005.68 5.71"
                            />
                          </svg>
                        ) : (
                          <svg className="h-7 w-7 translate-x-[2px]" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z" />
                          </svg>
                        )}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={title || 'Preview'}
                  className="max-h-[min(70dvh,720px)] w-full rounded-lg object-contain"
                />
              )}
            </div>

            {error ? (
              <div className="shrink-0 border-t border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
                {error}
              </div>
            ) : null}

            {caption ? (
              <div className="max-h-28 shrink-0 overflow-y-auto border-t border-white/10 px-4 py-3">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/65">{caption}</p>
              </div>
            ) : null}

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/5"
                >
                  Open original
                </a>
                <button
                  type="button"
                  disabled={downloading}
                  onClick={() => void handleDownload()}
                  className="rounded-lg border border-[#7c5cff]/40 bg-[#7c5cff]/15 px-3 py-1.5 text-xs font-semibold text-[#d4c8ff] hover:bg-[#7c5cff]/25 disabled:opacity-50"
                >
                  {downloading ? 'Downloading…' : 'Download'}
                </button>
                {video ? (
                  <button
                    type="button"
                    disabled={!objectUrl || showLoading}
                    onClick={() => void togglePlay()}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-medium text-white/75 hover:bg-white/5 disabled:opacity-50"
                  >
                    {showLoading
                      ? phase === 'loading'
                        ? 'Preparing…'
                        : 'Starting…'
                      : ended
                        ? 'Replay'
                        : playing
                          ? 'Pause'
                          : 'Play'}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
              >
                Close
              </button>
            </footer>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
