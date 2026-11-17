'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import { formatSlotLabel } from '@/app/lib/social-content/peak-slots'
import { DEFAULT_TIME_ZONE } from '@/app/lib/social-content/categories'
import { SocialGenerateCartoonLoader } from '@/app/(crm)/social-scheduling/_components/SocialGenerateCartoonLoader'
import { SocialMediaPreviewLightbox } from '@/app/(crm)/social-scheduling/_components/SocialMediaPreviewLightbox'
import { SocialMediaThumb } from '@/app/(crm)/social-scheduling/_components/SocialMediaThumb'

type BatchItem = {
  id: string
  dayIndex: number
  categoryId: string
  categoryLabel: string
  caption: string
  mediaUrl: string | null
  mediaThumbUrl?: string | null
  mediaType: string | null
  mediaSource: string | null
  mediaTitle: string | null
  suggestedAt: string | null
  status: string
  lastError: string | null
}

type BatchProgress = {
  current: number
  total: number
  label: string
  message: string
}

type Batch = {
  id: string
  status: string
  days: number
  timeZone: string
  createdAt: string
  progress: BatchProgress | null
  items: BatchItem[]
}

type Props = {
  open: boolean
  onClose: () => void
  onApproved: () => void
  onStatusChange?: (batch: Batch | null) => void
}

export function SocialGenerateWeekModal({ open, onClose, onApproved, onStatusChange }: Props) {
  const [mounted, setMounted] = useState(false)
  const [batch, setBatch] = useState<Batch | null>(null)
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<BatchItem | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const kickRef = useRef(false)

  useEffect(() => setMounted(true), [])

  // Lock page scroll while modal is open so wheel/trackpad targets the list.
  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    const prevPadding = document.body.style.paddingRight
    const scrollbar = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`
    return () => {
      document.body.style.overflow = prevOverflow
      document.body.style.paddingRight = prevPadding
    }
  }, [open])

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const applyBatch = useCallback(
    (next: Batch | null) => {
      setBatch(next)
      // Always sync loader to real server status — prevents sticky "starting" stuck screen.
      setStarting(next?.status === 'generating')
      if (next?.status === 'pending_review') {
        setMessage('7-day content ready for review.')
        setError(null)
      }
      if (next?.status === 'failed') {
        setError(next.progress?.message || 'Generation failed')
      }
      onStatusChange?.(next)
    },
    [onStatusChange]
  )

  const fetchBatch = useCallback(async () => {
    const res = await adminFetch('/api/social-scheduling/generate')
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(data.error || 'Failed to load')
    return (data.batch ?? null) as Batch | null
  }, [])

  const ensureWorker = useCallback(async (batchId: string) => {
    // Fallback kick if after() didn't run (e.g. some local setups).
    void adminFetch('/api/social-scheduling/generate/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ batchId }),
    }).catch(() => {})
  }, [])

  const pollOnce = useCallback(async () => {
    try {
      const next = await fetchBatch()
      applyBatch(next)
      if (next?.status === 'generating') {
        if (!kickRef.current) {
          kickRef.current = true
          void ensureWorker(next.id)
        }
        return true
      }
      kickRef.current = false
      stopPoll()
      return false
    } catch {
      return true // keep trying
    }
  }, [applyBatch, ensureWorker, fetchBatch, stopPoll])

  const startPolling = useCallback(() => {
    stopPoll()
    void pollOnce()
    pollRef.current = setInterval(() => {
      void pollOnce()
    }, 1500)
  }, [pollOnce, stopPoll])

  useEffect(() => {
    if (!open) {
      setPreviewItem(null)
      return
    }
    setError(null)
    setMessage(null)
    kickRef.current = false
    void (async () => {
      setLoading(true)
      try {
        const next = await fetchBatch()
        applyBatch(next)
        if (next?.status === 'generating') {
          startPolling()
          void ensureWorker(next.id)
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load')
        setStarting(false)
      } finally {
        setLoading(false)
      }
    })()
    return () => stopPoll()
  }, [open, applyBatch, ensureWorker, fetchBatch, startPolling, stopPoll])

  const generate = async (recreate: boolean) => {
    stopPoll()
    kickRef.current = false
    setStarting(true)
    setError(null)
    setMessage(recreate ? 'Recreate started…' : 'Generate started…')
    // Clear stale 7/7 progress so recreate doesn't look "stuck finished".
    applyBatch({
      id: 'optimistic',
      status: 'generating',
      days: 7,
      timeZone: batch?.timeZone || DEFAULT_TIME_ZONE,
      createdAt: new Date().toISOString(),
      progress: {
        current: 0,
        total: 7,
        label: 'Bersedia',
        message: recreate ? 'Memulakan recreate…' : 'Memulakan generate…',
      },
      items: [],
    })
    try {
      const res = await adminFetch('/api/social-scheduling/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recreate }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Generate failed')
      applyBatch(data.batch)
      setMessage('Background service started — cartoon goldbar sedang jalan…')
      if (data.batch?.status === 'generating' && data.batch?.id) {
        startPolling()
        void ensureWorker(data.batch.id)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generate failed')
      setStarting(false)
      // Reload last real batch so UI isn't stuck on optimistic shell.
      try {
        applyBatch(await fetchBatch())
      } catch {
        applyBatch(null)
      }
    }
  }

  const approve = async () => {
    if (!batch) return
    if (
      !confirm(
        'Approve this batch? Posts will be created as TryPost DRAFTS on all connected accounts. You still schedule/publish later.'
      )
    ) {
      return
    }
    setApproving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await adminFetch('/api/social-scheduling/generate/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: batch.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Approve failed')
      applyBatch(data.batch)
      setMessage(`Approved ${data.approved} draft(s)${data.failed ? `, ${data.failed} failed` : ''}.`)
      onApproved()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approve failed')
    } finally {
      setApproving(false)
    }
  }

  // Prefer server status; `starting` only covers the brief POST gap.
  // Safety: never keep the cartoon up after server says ready/failed.
  useEffect(() => {
    if (batch?.status && batch.status !== 'generating' && starting) {
      setStarting(false)
    }
  }, [batch?.status, starting])

  const isGenerating =
    batch?.status === 'generating' || (starting && (!batch || batch.id === 'optimistic'))
  const busy = isGenerating || approving || starting

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[300] flex items-end justify-center bg-black/80 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/40"
            aria-label="Close"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-week-title"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16 }}
            className="relative z-10 flex h-[min(92dvh,860px)] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-[#141416] text-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            onWheel={(e) => e.stopPropagation()}
          >
            <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <h3 id="generate-week-title" className="text-base font-semibold sm:text-lg">
                  Generate 7-day content
                </h3>
                <p className="mt-0.5 text-xs text-white/45 sm:text-sm">
                  Background service · peak hours · BM caption · approve as drafts
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="shrink-0 rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </header>

            <div
              className="min-h-0 flex-1 overflow-y-scroll overscroll-contain px-4 py-4 sm:px-5"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {(error || message) && !isGenerating && (
                <p
                  className={`mb-3 rounded-lg px-3 py-2 text-sm ${
                    error ? 'bg-rose-500/15 text-rose-200' : 'bg-emerald-500/15 text-emerald-200'
                  }`}
                >
                  {error || message}
                </p>
              )}

              {loading ? (
                <div className="flex items-center justify-center gap-2 py-20 text-sm text-white/45">
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[#7c5cff]" />
                  Loading…
                </div>
              ) : isGenerating ? (
                <SocialGenerateCartoonLoader
                  title={batch?.progress?.label || 'Sedang jana content…'}
                  subtitle={
                    batch?.progress?.message ||
                    'Boleh tutup modal — background service terus jalan.'
                  }
                  progressCurrent={batch?.progress?.current ?? 0}
                  progressTotal={batch?.progress?.total ?? batch?.days ?? 7}
                />
              ) : !batch || batch.status === 'discarded' ? (
                <div className="space-y-4 py-10 text-center">
                  <p className="text-sm text-white/60">
                    Tiada batch lagi. Jana 7 draft (5 kategori berputar) dengan media R2/Telegram + caption BM.
                  </p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(false)}
                    className="rounded-xl bg-[#7c5cff] px-5 py-2.5 text-sm font-semibold hover:bg-[#6d4fff] disabled:opacity-50"
                  >
                    Generate 7 days
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                    <span>
                      Status: <span className="text-white/80">{batch.status}</span> · {batch.items.length} posts
                    </span>
                    <span>TZ {batch.timeZone || DEFAULT_TIME_ZONE}</span>
                  </div>
                  {batch.items.map((item) => (
                    <article
                      key={item.id}
                      className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
                    >
                      <div className="flex gap-3 p-3">
                        <SocialMediaThumb
                          url={item.mediaUrl}
                          thumbUrl={item.mediaThumbUrl}
                          mediaType={item.mediaType}
                          alt={item.mediaTitle || item.categoryLabel}
                          sizeClassName="h-20 w-20 sm:h-24 sm:w-24"
                          onOpen={
                            item.mediaUrl
                              ? () => setPreviewItem(item)
                              : undefined
                          }
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded-md bg-[#7c5cff]/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c4b5fd]">
                              Day {item.dayIndex + 1}
                            </span>
                            <span className="truncate text-xs font-medium text-white/85">
                              {item.categoryLabel}
                            </span>
                            {item.suggestedAt && (
                              <span className="text-[11px] text-white/40">
                                Peak {formatSlotLabel(item.suggestedAt, batch.timeZone)}
                              </span>
                            )}
                            <span className="text-[10px] uppercase text-white/35">{item.status}</span>
                          </div>
                          <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-white/70">
                            {item.caption}
                          </p>
                          {item.lastError && (
                            <p className="text-xs text-rose-300">{item.lastError}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="min-w-0 flex-1 truncate text-[10px] text-white/30">
                              {item.mediaSource || '—'}
                              {item.mediaTitle ? ` · ${item.mediaTitle}` : ''}
                            </p>
                            {item.mediaUrl && (
                              <button
                                type="button"
                                onClick={() => setPreviewItem(item)}
                                className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/75 hover:bg-white/5"
                              >
                                {(item.mediaType || '').includes('video') ? 'Play' : 'Preview'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>

            <footer className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
              <p className="text-xs text-white/40">
                {isGenerating
                  ? 'Running in background — safe to close.'
                  : 'Approve = create TryPost drafts only (not published).'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg px-3 py-2 text-sm text-white/60 hover:bg-white/5"
                >
                  {isGenerating ? 'Hide' : 'Close'}
                </button>
                {batch && batch.status !== 'generating' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(true)}
                    className="rounded-lg border border-white/15 px-3 py-2 text-sm font-medium text-white/80 hover:bg-white/5 disabled:opacity-50"
                  >
                    Recreate all
                  </button>
                )}
                {batch?.status === 'pending_review' && (
                  <button
                    type="button"
                    disabled={busy || !batch.items.some((i) => i.status === 'draft')}
                    onClick={() => void approve()}
                    className="rounded-lg bg-[#7c5cff] px-4 py-2 text-sm font-semibold hover:bg-[#6d4fff] disabled:opacity-50"
                  >
                    {approving ? 'Approving…' : 'Approve drafts'}
                  </button>
                )}
                {batch && (batch.status === 'approved' || batch.status === 'failed') && !busy && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void generate(false)}
                    className="rounded-lg bg-[#7c5cff] px-4 py-2 text-sm font-semibold hover:bg-[#6d4fff] disabled:opacity-50"
                  >
                    Generate new week
                  </button>
                )}
              </div>
            </footer>
          </motion.div>

          <SocialMediaPreviewLightbox
            open={Boolean(previewItem?.mediaUrl)}
            url={previewItem?.mediaUrl || null}
            thumbUrl={previewItem?.mediaThumbUrl}
            mediaType={previewItem?.mediaType}
            title={
              previewItem
                ? `Day ${previewItem.dayIndex + 1} · ${previewItem.categoryLabel}`
                : null
            }
            caption={previewItem?.caption || previewItem?.mediaTitle || null}
            onClose={() => setPreviewItem(null)}
          />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
