'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'

export type LibraryMediaAsset = {
  id: string
  title: string
  originalFilename: string
  publicUrl: string
  mediaType: string
  mimeType: string
  sizeBytes?: number
  folder?: string
}

type Props = {
  open: boolean
  onClose: () => void
  onSelect: (assets: LibraryMediaAsset[]) => void
  /** Already attached public URLs — shown as selected when browsing. */
  selectedUrls?: string[]
  /** Allow picking more than one asset before confirming. */
  multiple?: boolean
}

type FilterType = 'all' | 'image' | 'video' | 'pdf'

function formatBytes(n?: number) {
  if (!n || n <= 0) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

function typeBadge(mediaType: string) {
  return mediaType.toUpperCase()
}

export function SocialMediaLibraryPicker({
  open,
  onClose,
  onSelect,
  selectedUrls = [],
  multiple = true,
}: Props) {
  const [assets, setAssets] = useState<LibraryMediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [folder, setFolder] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [picked, setPicked] = useState<LibraryMediaAsset[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (filter !== 'all') params.set('type', filter)
      if (search.trim()) params.set('q', search.trim())
      if (folder.trim()) params.set('folder', folder.trim())
      const res = await adminFetch(`/api/admin/media?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(
          res.status === 403
            ? 'Admin access required to browse the media library.'
            : data.error || 'Failed to load media library'
        )
      }
      const list = (data.assets ?? []) as LibraryMediaAsset[]
      // Social posts: images, videos, PDFs (skip audio)
      setAssets(list.filter((a) => a.mediaType === 'image' || a.mediaType === 'video' || a.mediaType === 'pdf'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load media')
      setAssets([])
    } finally {
      setLoading(false)
    }
  }, [filter, search, folder])

  useEffect(() => {
    if (!open) return
    setPicked([])
    void load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const togglePick = (asset: LibraryMediaAsset) => {
    if (!multiple) {
      onSelect([asset])
      onClose()
      return
    }
    setPicked((prev) => {
      const exists = prev.some((a) => a.id === asset.id)
      if (exists) return prev.filter((a) => a.id !== asset.id)
      return [...prev, asset]
    })
  }

  const confirm = () => {
    if (!picked.length) return
    onSelect(picked)
    onClose()
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[130] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-library-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className="relative flex max-h-[min(92dvh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#141416] text-white shadow-2xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <h3 id="media-library-title" className="text-base font-semibold sm:text-lg">
                  Media library
                </h3>
                <p className="mt-0.5 text-xs text-white/45 sm:text-sm">
                  Choose from your Cloudflare R2 storage
                </p>
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

            <div className="flex shrink-0 flex-col gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="flex flex-wrap gap-1.5">
                {(['all', 'image', 'video', 'pdf'] as FilterType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setFilter(t)}
                    className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
                      filter === t
                        ? 'bg-[#7c5cff] text-white'
                        : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {t === 'all' ? 'All' : t === 'pdf' ? 'PDF' : `${t}s`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void load()
                  }}
                  placeholder="Search title or filename"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#1c1c1f] px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50"
                />
                <input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void load()
                  }}
                  placeholder="Filter folder"
                  className="w-full rounded-lg border border-white/15 bg-[#1c1c1f] px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50 sm:w-40"
                />
                <button
                  type="button"
                  onClick={() => void load()}
                  className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5"
                >
                  Search
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
              {error && (
                <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/45">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#7c5cff]" />
                  Loading library…
                </div>
              ) : assets.length === 0 ? (
                <div className="py-16 text-center text-sm text-white/45">
                  <p>No media found in R2.</p>
                  <Link
                    href="/admin/media"
                    target="_blank"
                    className="mt-2 inline-block font-medium text-[#a78bfa] hover:underline"
                  >
                    Open Media library to upload
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {assets.map((asset) => {
                    const isPicked = picked.some((a) => a.id === asset.id)
                    const alreadyAttached = selectedUrls.includes(asset.publicUrl)
                    return (
                      <button
                        key={asset.id}
                        type="button"
                        onClick={() => togglePick(asset)}
                        className={`overflow-hidden rounded-xl border text-left transition ${
                          isPicked
                            ? 'border-[#7c5cff] ring-2 ring-[#7c5cff]/40'
                            : alreadyAttached
                              ? 'border-emerald-500/40'
                              : 'border-white/10 hover:border-white/25'
                        }`}
                      >
                        <div className="relative aspect-video bg-[#1c1c1f]">
                          {asset.mediaType === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={asset.publicUrl}
                              alt={asset.title}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : asset.mediaType === 'video' ? (
                            <video
                              src={asset.publicUrl}
                              className="h-full w-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs font-semibold text-white/40">
                              PDF
                            </div>
                          )}
                          {(isPicked || alreadyAttached) && (
                            <span
                              className={`absolute right-2 top-2 flex size-6 items-center justify-center rounded-md text-white ${
                                isPicked ? 'bg-[#7c5cff]' : 'bg-emerald-600'
                              }`}
                            >
                              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </div>
                        <div className="space-y-1 px-2.5 py-2">
                          <p className="line-clamp-1 text-xs font-medium text-white/90">{asset.title}</p>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-medium text-white/70">
                              {typeBadge(asset.mediaType)}
                            </span>
                            {formatBytes(asset.sizeBytes) && (
                              <span className="text-[10px] text-white/40">{formatBytes(asset.sizeBytes)}</span>
                            )}
                          </div>
                          {asset.folder ? (
                            <p className="truncate text-[10px] text-white/35">{asset.folder}</p>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
              <Link
                href="/admin/media"
                target="_blank"
                className="text-sm font-medium text-[#a78bfa] hover:underline"
              >
                Manage library
              </Link>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white"
                >
                  Cancel
                </button>
                {multiple && (
                  <button
                    type="button"
                    disabled={!picked.length}
                    onClick={confirm}
                    className="rounded-lg bg-[#7c5cff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
                  >
                    {picked.length ? `Add ${picked.length}` : 'Add selected'}
                  </button>
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
