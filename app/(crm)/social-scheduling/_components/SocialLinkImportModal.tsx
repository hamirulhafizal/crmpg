'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { LibraryMediaAsset } from '@/app/(crm)/social-scheduling/_components/SocialMediaLibraryPicker'

type Props = {
  open: boolean
  onClose: () => void
  onImported: (payload: { asset: LibraryMediaAsset; caption: string }) => void
}

const EXAMPLES = [
  'youtube.com/shorts/…',
  'instagram.com/reel/…',
  'tiktok.com/@…/video/…',
  'facebook.com/share/r/…',
]

export function SocialLinkImportModal({ open, onClose, onImported }: Props) {
  const [mounted, setMounted] = useState(false)
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setUrl('')
      setError(null)
      setStatus(null)
      setLoading(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, loading, onClose])

  const submit = async () => {
    const trimmed = url.trim()
    if (!trimmed) {
      setError('Paste a video link first.')
      return
    }
    setError(null)
    setLoading(true)
    setStatus('Downloading video…')
    try {
      const res = await adminFetch('/api/social-scheduling/media/import-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      setStatus('Generating BM caption…')
      const json = await res.json().catch(() => ({} as { error?: string }))
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : `Import failed (${res.status})`)
      }
      const raw = json.asset as Partial<LibraryMediaAsset> | undefined
      if (!raw?.id || !raw.publicUrl) throw new Error('Import succeeded but media URL is missing.')
      const asset: LibraryMediaAsset = {
        id: raw.id,
        title: raw.title || raw.originalFilename || 'Imported video',
        originalFilename: raw.originalFilename || 'imported-video.mp4',
        publicUrl: raw.publicUrl,
        mediaType: raw.mediaType || 'video',
        mimeType: raw.mimeType || 'video/mp4',
        sizeBytes: raw.sizeBytes,
        folder: raw.folder,
      }
      const caption = typeof json.caption === 'string' ? json.caption : ''
      onImported({ asset, caption })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed')
      setStatus(null)
    } finally {
      setLoading(false)
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/60 p-3 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!loading) onClose()
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Paste social video link"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#141416] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-white">Paste video link</h2>
                <p className="mt-0.5 text-[11px] text-white/45">
                  YouTube · Instagram · TikTok · Facebook
                </p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-lg px-2 py-1 text-xs text-white/50 hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                Close
              </button>
            </header>

            <div className="space-y-3 px-4 py-4">
              <label className="block text-[11px] font-medium uppercase tracking-wide text-white/40">
                Video URL
              </label>
              <textarea
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                rows={3}
                disabled={loading}
                placeholder="https://youtube.com/shorts/… or instagram.com/reel/…"
                className="w-full resize-none rounded-xl border border-white/10 bg-[#1c1c1f] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#7c5cff]/50 disabled:opacity-60"
                autoFocus
              />
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <span
                    key={ex}
                    className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-white/35"
                  >
                    {ex}
                  </span>
                ))}
              </div>

              <p className="text-[11px] leading-relaxed text-white/40">
                We download the video, write a BM caption from its context, add{' '}
                <span className="text-white/55">Kredit: @owner</span>, and your CTA
                (pg2u.my + WhatsApp).
              </p>

              {status && !error && (
                <div className="flex items-center gap-2 rounded-lg border border-[#7c5cff]/25 bg-[#7c5cff]/10 px-3 py-2 text-xs text-[#c4b5fd]">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/20 border-t-[#a78bfa]" />
                  {status}
                </div>
              )}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
                  {error}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                type="button"
                disabled={loading}
                onClick={onClose}
                className="rounded-lg px-3 py-2 text-xs text-white/60 hover:bg-white/5 hover:text-white disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || !url.trim()}
                onClick={() => void submit()}
                className="rounded-lg bg-[#7c5cff] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#6d4ff0] disabled:opacity-40"
              >
                {loading ? 'Importing…' : 'Import & caption'}
              </button>
            </footer>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
