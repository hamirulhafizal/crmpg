'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { TryPostPublishMode, TryPostSocialAccount } from '@/app/lib/trypost/types'
import { platformLabel, platformShort, platformVisual } from '@/app/lib/trypost/calendar-shared'

const PUBLISH_OPTIONS: { value: TryPostPublishMode; label: string }[] = [
  { value: 'queue_next', label: 'Next available' },
  { value: 'scheduled', label: 'Custom time' },
  { value: 'now', label: 'Publish now' },
  { value: 'draft', label: 'Save draft' },
  { value: 'queue_top', label: 'Queue top' },
  { value: 'pending_approval', label: 'Needs approval' },
]

type UploadedMedia = {
  id: string
  publicUrl: string
  mediaType: string
  mimeType: string
  originalFilename: string
  previewUrl?: string
}

type Props = {
  open: boolean
  channels: TryPostSocialAccount[]
  saving?: boolean
  initialDateKey?: string | null
  onClose: () => void
  onSubmit: (input: {
    content: string
    socialAccountIds: string[]
    publishMode: TryPostPublishMode
    scheduledAt: string | null
    mediaUrls: string[]
    createAnother: boolean
  }) => Promise<void>
}

function channelInitials(ch: TryPostSocialAccount): string {
  const raw = (ch.display_name || ch.username || '?').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

function channelTitle(ch: TryPostSocialAccount): string {
  return ch.display_name || (ch.username ? `@${ch.username}` : 'Channel')
}

function PlatformBadge({ platform }: { platform: string }) {
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

function ChannelAvatar({
  channel,
  size = 'md',
  selected = false,
}: {
  channel: TryPostSocialAccount
  size?: 'sm' | 'md'
  selected?: boolean
}) {
  const dim = size === 'sm' ? 'h-9 w-9 text-[10px]' : 'h-11 w-11 text-xs'
  return (
    <span className="relative inline-block shrink-0">
      <span
        className={`flex items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 font-bold text-slate-900 ${dim} ${
          selected ? 'ring-2 ring-[#7c5cff] ring-offset-2 ring-offset-[#141416]' : ''
        }`}
      >
        {channelInitials(channel)}
      </span>
      <PlatformBadge platform={channel.platform} />
    </span>
  )
}

export function SocialCreatePostModal({
  open,
  channels,
  saving = false,
  initialDateKey = null,
  onClose,
  onSubmit,
}: Props) {
  const connected = useMemo(
    () => (Array.isArray(channels) ? channels : []).filter((c) => c.status === 'connected'),
    [channels]
  )
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [content, setContent] = useState('')
  const [mediaItems, setMediaItems] = useState<UploadedMedia[]>([])
  const [publishMode, setPublishMode] = useState<TryPostPublishMode>('queue_next')
  const [scheduledAt, setScheduledAt] = useState('')
  const [createAnother, setCreateAnother] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [channelQuery, setChannelQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [mounted, setMounted] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setSelectedIds(connected.map((c) => c.id))
    setContent('')
    setMediaItems([])
    setPublishMode(initialDateKey ? 'scheduled' : 'queue_next')
    setScheduledAt(initialDateKey ? `${initialDateKey}T10:00` : '')
    setCreateAnother(false)
    setError(null)
    setPickerOpen(false)
    setChannelQuery('')
    setUploading(false)
    setDragOver(false)
  }, [open, connected, initialDateKey])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (pickerOpen) setPickerOpen(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, pickerOpen])

  useEffect(() => {
    if (!pickerOpen) return
    const onPointer = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointer)
    queueMicrotask(() => searchRef.current?.focus())
    return () => window.removeEventListener('mousedown', onPointer)
  }, [pickerOpen])

  const toggleChannel = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  const filteredChannels = useMemo(() => {
    const q = channelQuery.trim().toLowerCase()
    if (!q) return connected
    return connected.filter((c) => {
      const hay = `${c.display_name ?? ''} ${c.username ?? ''} ${c.platform}`.toLowerCase()
      return hay.includes(q)
    })
  }, [connected, channelQuery])

  const selectedChannels = connected.filter((c) => selectedIds.includes(c.id))
  const mediaUrls = mediaItems.map((m) => m.publicUrl)
  const previewReady = Boolean(content.trim() || mediaUrls.length)

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setError(null)
    setUploading(true)
    try {
      for (const file of list) {
        const localPreview = file.type.startsWith('image/') || file.type.startsWith('video/')
          ? URL.createObjectURL(file)
          : undefined
        const fd = new FormData()
        fd.append('file', file)
        const res = await adminFetch('/api/social-scheduling/media/upload', {
          method: 'POST',
          body: fd,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (localPreview) URL.revokeObjectURL(localPreview)
          throw new Error(json.error || 'Upload failed')
        }
        const asset = json.asset as UploadedMedia
        setMediaItems((prev) => [
          ...prev,
          {
            ...asset,
            previewUrl: localPreview,
          },
        ])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeMedia = (id: string) => {
    setMediaItems((prev) => {
      const target = prev.find((m) => m.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((m) => m.id !== id)
    })
  }

  const submit = async (mode: TryPostPublishMode = publishMode) => {
    setError(null)
    if (!selectedIds.length) {
      setError('Select at least one channel.')
      return
    }
    if (!content.trim() && !mediaUrls.length) {
      setError('Add a caption or media.')
      return
    }
    if (mode === 'scheduled' && !scheduledAt) {
      setError('Pick a schedule time.')
      return
    }
    if (uploading) {
      setError('Wait for media upload to finish.')
      return
    }
    try {
      await onSubmit({
        content,
        socialAccountIds: selectedIds,
        publishMode: mode,
        scheduledAt: mode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        mediaUrls,
        createAnother,
      })
      if (createAnother) {
        setContent('')
        mediaItems.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl))
        setMediaItems([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    }
  }

  if (!mounted) return null

  return createPortal(
    <AnimatePresence>
      {open && (
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
            aria-labelledby="create-post-title"
            className={`flex max-h-[92vh] w-full overflow-hidden rounded-2xl border border-white/10 bg-[#141416] text-white shadow-2xl ${
              showPreview ? 'max-w-5xl' : 'max-w-2xl'
            }`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3">
                <h2 id="create-post-title" className="text-base font-semibold">
                  Create a new post
                </h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 7h.01M7 3h5a2 2 0 012 2v0a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2zm0 12h.01M7 11h5a2 2 0 012 2v0a2 2 0 01-2 2H7a2 2 0 01-2-2v0a2 2 0 012-2z"
                    />
                  </svg>
                  Labels
                </button>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ${
                      showPreview ? 'bg-[#7c5cff] text-white' : 'border border-white/10 text-white/70'
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                    Preview
                  </button>
                  <button
                    type="button"
                    aria-label="Close"
                    onClick={onClose}
                    className="rounded-lg p-1.5 text-white/60 hover:bg-white/5 hover:text-white"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                {/* Channel avatars + picker */}
                <div className="relative mb-4" ref={pickerRef}>
                  <div className="flex flex-wrap items-center gap-2.5">
                    {selectedChannels.map((ch) => (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setPickerOpen(true)}
                        title={`${channelTitle(ch)} · ${platformLabel(ch.platform)}`}
                      >
                        <ChannelAvatar channel={ch} selected />
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-dashed border-white/25 text-lg text-white/70 transition hover:border-white/50 hover:text-white"
                      aria-label="Add channel"
                      aria-expanded={pickerOpen}
                    >
                      +
                    </button>
                  </div>

                  <AnimatePresence>
                    {pickerOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 4, scale: 0.98 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-0 top-[3.25rem] z-20 w-[min(100%,320px)] overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1f] shadow-2xl"
                      >
                        <div className="border-b border-white/10 p-2.5">
                          <div className="relative">
                            <svg
                              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
                              />
                            </svg>
                            <input
                              ref={searchRef}
                              value={channelQuery}
                              onChange={(e) => setChannelQuery(e.target.value)}
                              placeholder="Search channels…"
                              className="w-full rounded-lg border border-white/10 bg-[#141416] py-2 pl-8 pr-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between px-3 py-2">
                          <span className="text-xs font-medium text-white/45">Channels</span>
                          <button
                            type="button"
                            onClick={() => setSelectedIds([])}
                            className="text-xs font-medium text-[#a78bfa] hover:text-[#c4b5fd]"
                          >
                            Deselect all
                          </button>
                        </div>

                        <div className="max-h-64 overflow-y-auto px-1.5 pb-2">
                          {filteredChannels.length === 0 ? (
                            <p className="px-2 py-4 text-center text-xs text-white/40">No channels found</p>
                          ) : (
                            filteredChannels.map((ch) => {
                              const active = selectedIds.includes(ch.id)
                              return (
                                <button
                                  key={ch.id}
                                  type="button"
                                  onClick={() => toggleChannel(ch.id)}
                                  className={`flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition ${
                                    active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                                  }`}
                                >
                                  <ChannelAvatar channel={ch} size="sm" />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium text-white">
                                      {channelTitle(ch)}
                                    </span>
                                    <span className="block truncate text-xs text-white/45">
                                      {platformLabel(ch.platform)}
                                      {ch.username ? ` · @${ch.username}` : ''}
                                    </span>
                                  </span>
                                  <span
                                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                      active
                                        ? 'border-[#7c5cff] bg-[#7c5cff] text-white'
                                        : 'border-white/20 bg-transparent text-transparent'
                                    }`}
                                    aria-hidden
                                  >
                                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={3}
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  </span>
                                </button>
                              )
                            })
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={7}
                  placeholder="Start writing or get inspired with Templates."
                  className="w-full resize-none rounded-xl border border-white/10 bg-[#1c1c1f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#7c5cff]/60 focus:ring-1 focus:ring-[#7c5cff]/40"
                />

                {/* Media dropzone + thumbnails */}
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {mediaItems.map((item) => (
                    <div
                      key={item.id}
                      className="group relative h-28 w-24 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f]"
                    >
                      {item.mediaType === 'video' || item.mimeType.startsWith('video/') ? (
                        <video
                          src={item.previewUrl || item.publicUrl}
                          className="h-full w-full object-cover"
                          muted
                          playsInline
                          preload="metadata"
                        />
                      ) : item.mediaType === 'image' || item.mimeType.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.previewUrl || item.publicUrl}
                          alt={item.originalFilename}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center px-2 text-center text-[10px] text-white/60">
                          {item.originalFilename}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
                      >
                        ✕
                      </button>
                    </div>
                  ))}

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                      onDragEnter={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                      }}
                      onDragOver={(e) => {
                        e.preventDefault()
                        setDragOver(true)
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        setDragOver(false)
                        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
                      }}
                      className={`flex h-28 w-24 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed px-2 text-center transition ${
                        dragOver
                          ? 'border-[#7c5cff] bg-[#7c5cff]/10 text-white'
                          : 'border-white/20 bg-transparent text-white/50 hover:border-white/40 hover:text-white/75'
                      } disabled:opacity-50`}
                    >
                      {uploading ? (
                        <span className="text-[11px] font-medium">Uploading…</span>
                      ) : (
                        <>
                          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={1.5}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                          <span className="text-[10px] leading-tight">
                            Drag & drop
                            <br />
                            or select a file
                          </span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center justify-center gap-2 text-white/40">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="rounded-md p-1 hover:bg-white/5 hover:text-white/70"
                        aria-label="Add media"
                        title="Add media"
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                          />
                        </svg>
                      </button>
                      <span className="rounded-md p-1 opacity-40" title="Emoji (soon)" aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </span>
                      <span className="rounded-md p-1 opacity-40" title="Link (soon)" aria-hidden>
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.75}
                            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                          />
                        </svg>
                      </span>
                    </div>
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,application/pdf"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.length) void uploadFiles(e.target.files)
                  }}
                />

                {error && (
                  <p className="mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
                )}
              </div>

              <footer className="flex shrink-0 flex-wrap items-center gap-3 border-t border-white/10 px-4 py-3">
                <label className="inline-flex items-center gap-2 text-xs text-white/60">
                  <input
                    type="checkbox"
                    checked={createAnother}
                    onChange={(e) => setCreateAnother(e.target.checked)}
                    className="rounded border-white/20 bg-transparent"
                  />
                  Create another
                </label>
                <button
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => void submit('draft')}
                  className="text-xs font-medium text-white/70 hover:text-white disabled:opacity-50"
                >
                  Save drafts
                </button>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={publishMode}
                      onChange={(e) => setPublishMode(e.target.value as TryPostPublishMode)}
                      className="rounded-lg border border-white/10 bg-[#1c1c1f] px-2.5 py-2 text-xs text-white"
                    >
                      {PUBLISH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {publishMode === 'scheduled' && (
                      <input
                        type="datetime-local"
                        value={scheduledAt}
                        onChange={(e) => setScheduledAt(e.target.value)}
                        className="rounded-lg border border-white/10 bg-[#1c1c1f] px-2 py-1.5 text-xs text-white"
                      />
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={saving || uploading}
                    onClick={() => void submit()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#7c5cff] px-4 py-2 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:opacity-50"
                  >
                    {saving ? 'Working…' : 'Customize for each network'}
                    <span aria-hidden>→</span>
                  </button>
                </div>
              </footer>
            </div>

            {showPreview && (
              <aside className="hidden w-[320px] shrink-0 flex-col border-l border-white/10 bg-[#101012] sm:flex">
                <div className="border-b border-white/10 px-4 py-3 text-sm font-medium text-white/80">
                  Post previews
                </div>
                <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
                  {!previewReady ? (
                    <>
                      <div className="flex -space-x-3 opacity-40">
                        <div className="h-16 w-12 rounded-lg bg-white/10" />
                        <div className="h-20 w-14 rounded-lg bg-white/15" />
                        <div className="h-16 w-12 rounded-lg bg-white/10" />
                      </div>
                      <p className="text-sm text-white/45">Your post preview will appear here.</p>
                    </>
                  ) : (
                    <div className="w-full space-y-3">
                      {selectedChannels.map((ch) => (
                        <div
                          key={ch.id}
                          className="rounded-xl border border-white/10 bg-[#1c1c1f] p-3 text-left"
                        >
                          <div className="mb-2 flex items-center gap-2">
                            <ChannelAvatar channel={ch} size="sm" />
                            <div className="min-w-0 text-xs text-white/60">
                              <div className="truncate font-semibold text-white/90">{channelTitle(ch)}</div>
                              <div className="truncate">
                                {platformLabel(ch.platform)}
                                {ch.username ? ` · @${ch.username}` : ''}
                              </div>
                            </div>
                          </div>
                          {mediaItems[0] &&
                            (mediaItems[0].mediaType === 'video' ||
                            mediaItems[0].mimeType.startsWith('video/') ? (
                              <video
                                src={mediaItems[0].previewUrl || mediaItems[0].publicUrl}
                                className="mb-2 aspect-square w-full rounded-lg object-cover bg-black/40"
                                muted
                                playsInline
                                controls
                              />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={mediaItems[0].previewUrl || mediaItems[0].publicUrl}
                                alt=""
                                className="mb-2 aspect-square w-full rounded-lg object-cover bg-black/40"
                              />
                            ))}
                          <p className="whitespace-pre-wrap text-sm text-white/85">
                            {content.trim() || '(media only)'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </aside>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
