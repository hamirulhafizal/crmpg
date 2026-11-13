'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { LibraryMediaAsset } from '@/app/(crm)/social-scheduling/_components/SocialMediaLibraryPicker'

type TelegramItem = {
  messageId: number
  chatId: string
  channelTitle: string | null
  mediaType: string
  date: string | null
  caption: string
  fileName: string | null
  previewUrl: string
}

type Props = {
  open: boolean
  onClose: () => void
  onImported: (assets: LibraryMediaAsset[]) => void
}

type FilterType = 'all' | 'photo' | 'video'

function itemKey(item: Pick<TelegramItem, 'chatId' | 'messageId'>) {
  return `${item.chatId}:${item.messageId}`
}

function isVideoItem(item: TelegramItem) {
  return (item.mediaType || '').toLowerCase().includes('video')
}

function fileApiUrl(
  item: TelegramItem,
  opts?: { disposition?: 'inline' | 'attachment'; preview?: boolean }
) {
  const params = new URLSearchParams({
    messageId: String(item.messageId),
    chatId: item.chatId,
    mediaType: item.mediaType || 'photo',
    disposition: opts?.disposition || 'inline',
  })
  if (item.fileName) params.set('fileName', item.fileName)
  if (opts?.preview) params.set('preview', '1')
  return `/api/social-scheduling/telegram-media/file?${params.toString()}`
}

async function downloadBlob(url: string, fallbackName: string) {
  const res = await adminFetch(url)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `Download failed (${res.status})`)
  }
  const blob = await res.blob()
  const cd = res.headers.get('Content-Disposition') || ''
  const match = /filename="([^"]+)"/i.exec(cd)
  const name = match?.[1] || fallbackName
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
  return {
    contentType: blob.type,
    source: res.headers.get('X-Telegram-Source'),
    hostPath: res.headers.get('X-Telegram-Host-Path'),
  }
}

export function SocialTelegramMediaPicker({ open, onClose, onImported }: Props) {
  const [items, setItems] = useState<TelegramItem[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<FilterType>('all')
  const [nextOffsets, setNextOffsets] = useState<Record<string, number> | null>(null)
  const [picked, setPicked] = useState<TelegramItem[]>([])
  const [channelCount, setChannelCount] = useState<number | null>(null)
  const [catalogName, setCatalogName] = useState<string | null>(null)
  const [mounted, setMounted] = useState(false)
  const [statusError, setStatusError] = useState<string | null>(null)

  const [previewItem, setPreviewItem] = useState<TelegramItem | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewNote, setPreviewNote] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [playUrl, setPlayUrl] = useState<string | null>(null)
  const [playKind, setPlayKind] = useState<'video' | 'image' | null>(null)
  const playUrlRef = useRef<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const revokePlayUrl = useCallback(() => {
    if (playUrlRef.current) {
      URL.revokeObjectURL(playUrlRef.current)
      playUrlRef.current = null
    }
    setPlayUrl(null)
    setPlayKind(null)
  }, [])

  const load = useCallback(
    async (opts?: { append?: boolean; offsets?: Record<string, number> }) => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (search.trim()) params.set('q', search.trim())
        params.set('type', filter)
        params.set('limit', '24')
        if (opts?.append && opts.offsets && Object.keys(opts.offsets).length) {
          params.set('offsets', JSON.stringify(opts.offsets))
        }

        const res = await adminFetch(`/api/social-scheduling/telegram-media?${params.toString()}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Failed to search Telegram media')

        const nextItems = (data.items ?? []) as TelegramItem[]
        if (Array.isArray(data.chatIds) && data.chatIds.length) {
          setChannelCount(data.chatIds.length)
        }
        setNextOffsets(
          data.nextOffsets && typeof data.nextOffsets === 'object'
            ? (data.nextOffsets as Record<string, number>)
            : null
        )
        setItems((prev) => {
          if (!opts?.append) return nextItems
          const seen = new Set(prev.map(itemKey))
          return [...prev, ...nextItems.filter((item) => !seen.has(itemKey(item)))]
        })
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Search failed')
        if (!opts?.append) setItems([])
      } finally {
        setLoading(false)
      }
    },
    [filter, search]
  )

  useEffect(() => {
    if (!open) return
    setPicked([])
    setSearch('')
    setFilter('all')
    setStatusError(null)
    setNextOffsets(null)
    setPreviewItem(null)
    setPreviewNote(null)
    setPreviewError(null)
    revokePlayUrl()
    void (async () => {
      try {
        const res = await adminFetch('/api/social-scheduling/telegram-media?status=1')
        const data = await res.json().catch(() => ({}))
        if (typeof data.channelCount === 'number') setChannelCount(data.channelCount)
        else if (Array.isArray(data.chatIds)) setChannelCount(data.chatIds.length)
        if (typeof data.catalogName === 'string') setCatalogName(data.catalogName)
        if (!res.ok || data.ok === false || data.authorized === false) {
          setStatusError(
            data.error ||
              'Telegram session offline. Open the MCP setup page, authorize, and keep Docker running.'
          )
        }
      } catch {
        setStatusError('Telegram service unreachable.')
      }
      await load()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once on open
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (previewItem) {
        setPreviewItem(null)
        setPreviewError(null)
        setPreviewNote(null)
        revokePlayUrl()
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, previewItem, revokePlayUrl])

  useEffect(() => {
    return () => revokePlayUrl()
  }, [revokePlayUrl])

  const togglePick = (item: TelegramItem) => {
    setPicked((prev) => {
      const key = itemKey(item)
      const exists = prev.some((p) => itemKey(p) === key)
      if (exists) return prev.filter((p) => itemKey(p) !== key)
      return [...prev, item]
    })
  }

  const openPreview = (item: TelegramItem) => {
    revokePlayUrl()
    setPreviewError(null)
    setPreviewNote(
      isVideoItem(item)
        ? 'Thumbnail preview. Play loads the full video when the Telegram host exposes it; otherwise download the thumb or save on host.'
        : null
    )
    setPreviewItem(item)
  }

  const closePreview = () => {
    setPreviewItem(null)
    setPreviewError(null)
    setPreviewNote(null)
    revokePlayUrl()
  }

  const playPreview = async () => {
    if (!previewItem) return
    setPreviewBusy(true)
    setPreviewError(null)
    try {
      const res = await adminFetch(fileApiUrl(previewItem, { disposition: 'inline' }))
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Play failed (${res.status})`)
      }
      const contentType = (res.headers.get('Content-Type') || '').split(';')[0]!.trim()
      const source = res.headers.get('X-Telegram-Source')
      const hostPath = res.headers.get('X-Telegram-Host-Path')
      const blob = await res.blob()
      revokePlayUrl()
      const objectUrl = URL.createObjectURL(blob)
      playUrlRef.current = objectUrl
      setPlayUrl(objectUrl)

      if (contentType.startsWith('video/')) {
        setPlayKind('video')
        setPreviewNote(source === 'file' ? 'Playing full video file.' : 'Playing video preview.')
      } else {
        setPlayKind('image')
        setPreviewNote(
          isVideoItem(previewItem)
            ? hostPath
              ? `Full video is on the Telegram host (${hostPath}). Streaming isn’t exposed yet — showing thumbnail. Use Download thumb or Save on host.`
              : 'Full video stream isn’t available from the Telegram host yet — showing thumbnail. Use Download thumb or Save on host.'
            : null
        )
      }
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Play failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const downloadManual = async (mode: 'auto' | 'thumb' | 'host') => {
    if (!previewItem) return
    setPreviewBusy(true)
    setPreviewError(null)
    try {
      if (mode === 'host') {
        const res = await adminFetch('/api/social-scheduling/telegram-media/file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: previewItem.messageId,
            chatId: previewItem.chatId,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data.error || 'Host download failed')
        setPreviewNote(data.message || 'Saved on Telegram host.')
        return
      }

      const preferPreview = mode === 'thumb' || !isVideoItem(previewItem)
      const meta = await downloadBlob(
        fileApiUrl(previewItem, {
          disposition: 'attachment',
          preview: preferPreview,
        }),
        `telegram_${previewItem.messageId}${preferPreview ? '.jpg' : ''}`
      )

      if (isVideoItem(previewItem) && !preferPreview && meta.source === 'preview') {
        setPreviewNote(
          meta.hostPath
            ? `Downloaded thumbnail. Full file is on host: ${meta.hostPath}`
            : 'Downloaded thumbnail — full video file isn’t streamable from the Telegram host yet.'
        )
      } else {
        setPreviewNote(preferPreview ? 'Thumbnail downloaded.' : 'File downloaded.')
      }
    } catch (e) {
      // Video auto-download often fails without /file — fall back to thumb.
      if (mode === 'auto' && isVideoItem(previewItem)) {
        try {
          await downloadBlob(
            fileApiUrl(previewItem, { disposition: 'attachment', preview: true }),
            `telegram_${previewItem.messageId}.jpg`
          )
          setPreviewNote(
            'Full video isn’t available for browser download yet — saved the thumbnail instead. Use Save on host for the MP4.'
          )
          setPreviewError(null)
          return
        } catch {
          // keep original error
        }
      }
      setPreviewError(e instanceof Error ? e.message : 'Download failed')
    } finally {
      setPreviewBusy(false)
    }
  }

  const importSelected = async (only?: TelegramItem[]) => {
    const batch = only?.length ? only : picked
    if (!batch.length) return
    setImporting(true)
    setError(null)
    setPreviewError(null)
    try {
      const res = await adminFetch('/api/social-scheduling/telegram-media/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: batch.map((p) => ({
            messageId: p.messageId,
            chatId: p.chatId,
            mediaType: p.mediaType,
            caption: p.caption,
            fileName: p.fileName,
          })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Import to R2 failed')

      const assets = (data.assets ?? []) as LibraryMediaAsset[]
      if (!assets.length) throw new Error('Import returned no assets')
      onImported(assets)
      onClose()
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed'
      if (only?.length) setPreviewError(msg)
      else setError(msg)
    } finally {
      setImporting(false)
    }
  }

  const subtitle =
    channelCount && channelCount > 1
      ? `${catalogName ? `${catalogName} · ` : ''}${channelCount} channels · Search media, then import a copy into R2`
      : `${catalogName ? `${catalogName} · ` : ''}Search media, then import a copy into R2`

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
            aria-labelledby="telegram-media-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="relative flex max-h-[min(92dvh,820px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#141416] text-white shadow-2xl sm:rounded-2xl"
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div>
                <h3 id="telegram-media-title" className="text-base font-semibold sm:text-lg">
                  Telegram channels
                </h3>
                <p className="mt-0.5 text-xs text-white/45 sm:text-sm">{subtitle}</p>
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
                {(['all', 'photo', 'video'] as FilterType[]).map((t) => (
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
                    {t === 'all' ? 'All' : t === 'photo' ? 'Photos' : 'Videos'}
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
                  placeholder="Search caption or text…"
                  className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#1c1c1f] px-3 py-2 text-sm outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50"
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
              {(error || statusError) && (
                <p className="mb-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                  {error || statusError}
                </p>
              )}

              {loading && !items.length ? (
                <div className="flex items-center justify-center gap-2 py-16 text-sm text-white/45">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#7c5cff]" />
                  Searching Telegram…
                </div>
              ) : items.length === 0 ? (
                <p className="py-16 text-center text-sm text-white/45">No media found across channels.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {items.map((item) => {
                      const key = itemKey(item)
                      const isPicked = picked.some((p) => itemKey(p) === key)
                      const video = isVideoItem(item)
                      return (
                        <div
                          key={key}
                          className={`overflow-hidden rounded-xl border text-left transition ${
                            isPicked
                              ? 'border-[#7c5cff] ring-2 ring-[#7c5cff]/40'
                              : 'border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="relative aspect-square bg-[#1c1c1f]">
                            <button
                              type="button"
                              onClick={() => togglePick(item)}
                              className="absolute inset-0 z-0"
                              aria-label={isPicked ? 'Deselect' : 'Select'}
                            />
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={item.previewUrl}
                              alt={item.caption || `Message ${item.messageId}`}
                              className="pointer-events-none h-full w-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                e.currentTarget.style.opacity = '0.25'
                              }}
                            />
                            {video && (
                              <span className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
                                VIDEO
                              </span>
                            )}
                            {isPicked && (
                              <span className="pointer-events-none absolute right-2 top-2 flex size-6 items-center justify-center rounded-md bg-[#7c5cff] text-white">
                                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                openPreview(item)
                              }}
                              className="absolute bottom-2 right-2 z-10 rounded-md bg-black/75 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-black/90"
                            >
                              {video ? 'Play' : 'Preview'}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => togglePick(item)}
                            className="w-full space-y-1 px-2.5 py-2 text-left"
                          >
                            {item.channelTitle && (
                              <p className="truncate text-[10px] font-medium uppercase tracking-wide text-white/40">
                                {item.channelTitle}
                              </p>
                            )}
                            <p className="line-clamp-2 text-xs text-white/80">
                              {item.caption || item.fileName || `Message ${item.messageId}`}
                            </p>
                            {item.date && (
                              <p className="text-[10px] text-white/35">
                                {item.date.replace('T', ' ').slice(0, 16)}
                              </p>
                            )}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                  {nextOffsets && Object.keys(nextOffsets).length > 0 ? (
                    <div className="mt-4 flex justify-center">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void load({ append: true, offsets: nextOffsets })}
                        className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/70 hover:bg-white/5 disabled:opacity-50"
                      >
                        {loading ? 'Loading…' : 'Load older'}
                      </button>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
              <p className="text-xs text-white/40">Selected media is copied into R2 before attach.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!picked.length || importing}
                  onClick={() => void importSelected()}
                  className="rounded-lg bg-[#7c5cff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40"
                >
                  {importing
                    ? 'Importing to R2…'
                    : picked.length
                      ? `Import ${picked.length} to R2`
                      : 'Import to R2'}
                </button>
              </div>
            </footer>

            <AnimatePresence>
              {previewItem && (
                <motion.div
                  className="absolute inset-0 z-20 flex flex-col bg-[#0e0e10]/96 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">
                        {isVideoItem(previewItem) ? 'Video preview' : 'Photo preview'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/45">
                        {(previewItem.channelTitle ? `${previewItem.channelTitle} · ` : '') +
                          (previewItem.caption || previewItem.fileName || `Message ${previewItem.messageId}`)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closePreview}
                      className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
                      aria-label="Close preview"
                    >
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-4 py-4">
                    <div className="relative flex max-h-[min(52dvh,420px)] w-full max-w-lg items-center justify-center overflow-hidden rounded-xl bg-black/40">
                      {playKind === 'video' && playUrl ? (
                        // eslint-disable-next-line jsx-a11y/media-has-caption
                        <video
                          key={playUrl}
                          src={playUrl}
                          controls
                          autoPlay
                          playsInline
                          className="max-h-[min(52dvh,420px)] w-full object-contain"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={playKind === 'image' && playUrl ? playUrl : previewItem.previewUrl}
                          alt={previewItem.caption || 'Preview'}
                          className="max-h-[min(52dvh,420px)] w-full object-contain"
                          onError={(e) => {
                            e.currentTarget.style.opacity = '0.3'
                            setPreviewError((prev) => prev || 'Preview image failed to load.')
                          }}
                        />
                      )}
                    </div>

                    {(previewNote || previewError) && (
                      <p
                        className={`w-full max-w-lg rounded-lg px-3 py-2 text-xs ${
                          previewError ? 'bg-rose-500/15 text-rose-200' : 'bg-white/5 text-white/55'
                        }`}
                      >
                        {previewError || previewNote}
                      </p>
                    )}

                    <div className="flex w-full max-w-lg flex-wrap gap-2">
                      {isVideoItem(previewItem) && (
                        <button
                          type="button"
                          disabled={previewBusy}
                          onClick={() => void playPreview()}
                          className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
                        >
                          {previewBusy ? 'Loading…' : playKind === 'video' ? 'Reload video' : 'Play video'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={previewBusy}
                        onClick={() => void downloadManual('auto')}
                        className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/15 disabled:opacity-50"
                      >
                        Download
                      </button>
                      {isVideoItem(previewItem) && (
                        <>
                          <button
                            type="button"
                            disabled={previewBusy}
                            onClick={() => void downloadManual('thumb')}
                            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/75 hover:bg-white/5 disabled:opacity-50"
                          >
                            Download thumb
                          </button>
                          <button
                            type="button"
                            disabled={previewBusy}
                            onClick={() => void downloadManual('host')}
                            className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/75 hover:bg-white/5 disabled:opacity-50"
                          >
                            Save on host
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() => {
                          if (!picked.some((p) => itemKey(p) === itemKey(previewItem))) {
                            togglePick(previewItem)
                          }
                        }}
                        className="rounded-lg border border-white/15 px-3 py-2 text-sm text-white/75 hover:bg-white/5 disabled:opacity-50"
                      >
                        {picked.some((p) => itemKey(p) === itemKey(previewItem)) ? 'Selected' : 'Select'}
                      </button>
                      <button
                        type="button"
                        disabled={importing}
                        onClick={() => void importSelected([previewItem])}
                        className="rounded-lg bg-[#7c5cff] px-3 py-2 text-sm font-semibold hover:bg-[#6d4fff] disabled:opacity-50"
                      >
                        {importing ? 'Importing…' : 'Import to R2'}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
