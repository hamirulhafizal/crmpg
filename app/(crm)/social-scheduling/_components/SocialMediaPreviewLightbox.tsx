'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

type Props = {
  open: boolean
  url: string | null
  thumbUrl?: string | null
  mediaType?: string | null
  title?: string | null
  caption?: string | null
  onClose: () => void
}

function isVideo(url: string | null | undefined, mediaType?: string | null) {
  if ((mediaType || '').toLowerCase().includes('video')) return true
  return Boolean(url && /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url))
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
  const video = isVideo(url, mediaType)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      videoRef.current?.pause()
      return
    }
    if (video && videoRef.current) {
      void videoRef.current.play().catch(() => {
        // Autoplay may be blocked; controls remain available.
      })
    }
  }, [open, url, video])

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
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Media preview"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
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

            <div className="flex min-h-0 flex-1 items-center justify-center bg-black/40 p-3 sm:p-4">
              {video ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  ref={videoRef}
                  key={url}
                  src={url}
                  poster={thumbUrl || undefined}
                  controls
                  playsInline
                  preload="metadata"
                  className="max-h-[min(70dvh,720px)] w-full rounded-lg bg-black object-contain"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={url}
                  alt={title || 'Preview'}
                  className="max-h-[min(70dvh,720px)] w-full rounded-lg object-contain"
                />
              )}
            </div>

            {caption ? (
              <div className="max-h-28 shrink-0 overflow-y-auto border-t border-white/10 px-4 py-3">
                <p className="whitespace-pre-wrap text-xs leading-relaxed text-white/65">{caption}</p>
              </div>
            ) : null}

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3">
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
                onClick={onClose}
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
              >
                Close
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
