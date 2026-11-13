'use client'

import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { TryPostPublishMode, TryPostSocialAccount } from '@/app/lib/trypost/types'
import { platformLabel } from '@/app/lib/trypost/calendar-shared'
import {
  TIKTOK_PRIVACY_OPTIONS,
  collectDestinationIssues,
  countHashtags,
  defaultContentTypeForPlatform,
  getContentTypeRule,
  getPlatformRules,
  type ComposerIssue,
} from '@/app/lib/trypost/content-types'
import {
  SocialMediaLibraryPicker,
  type LibraryMediaAsset,
} from '@/app/(crm)/social-scheduling/_components/SocialMediaLibraryPicker'
import { SocialTelegramMediaPicker } from '@/app/(crm)/social-scheduling/_components/SocialTelegramMediaPicker'
import {
  PlatformLogoMark,
  SocialAccountAvatar,
} from '@/app/(crm)/social-scheduling/_components/SocialAccountAvatar'

const PUBLISH_OPTIONS: { value: TryPostPublishMode; label: string; icon?: 'clock' | 'calendar' }[] = [
  { value: 'queue_next', label: 'Next available', icon: 'clock' },
  { value: 'scheduled', label: 'Custom time', icon: 'calendar' },
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

export type CreatePostDestinationPayload = {
  socialAccountId: string
  content?: string | null
  contentType?: string | null
  mediaUrls?: string[]
  meta?: Record<string, unknown>
}

export type CreatePostSubmitInput = {
  content: string
  socialAccountIds: string[]
  publishMode: TryPostPublishMode
  scheduledAt: string | null
  mediaUrls: string[]
  createAnother: boolean
  destinations: CreatePostDestinationPayload[]
}

type DestinationDraft = {
  content: string
  contentType: string
  mediaItems: UploadedMedia[]
  useSharedContent: boolean
  useSharedMedia: boolean
  meta: Record<string, unknown>
  collaboratorInput: string
}

type Props = {
  open: boolean
  channels: TryPostSocialAccount[]
  saving?: boolean
  initialDateKey?: string | null
  onClose: () => void
  onSubmit: (input: CreatePostSubmitInput) => Promise<void>
}

type ComposerStep = 'shared' | 'customize'
type ViewMode = 'edit' | 'preview'

function channelTitle(ch: TryPostSocialAccount): string {
  return ch.display_name || (ch.username ? `@${ch.username}` : 'Channel')
}

function mediaKind(item: UploadedMedia): 'image' | 'video' | 'document' | 'other' {
  if (item.mediaType === 'video' || item.mimeType.startsWith('video/')) return 'video'
  if (item.mediaType === 'image' || item.mimeType.startsWith('image/')) return 'image'
  if (item.mimeType === 'application/pdf') return 'document'
  return 'other'
}

function emptyDraft(platform: string, sharedContent: string, sharedMedia: UploadedMedia[]): DestinationDraft {
  const kinds = sharedMedia.map(mediaKind)
  return {
    content: sharedContent,
    contentType: defaultContentTypeForPlatform(platform, kinds),
    mediaItems: [...sharedMedia],
    useSharedContent: true,
    useSharedMedia: true,
    meta: platform === 'tiktok' ? { privacy_level: 'PUBLIC_TO_EVERYONE' } : {},
    collaboratorInput: '',
  }
}

function MediaThumb({
  item,
  onRemove,
}: {
  item: UploadedMedia
  onRemove: () => void
}) {
  const kind = mediaKind(item)
  return (
    <div className="group relative h-[7.5rem] w-[7.5rem] overflow-hidden rounded-lg border border-white/10 bg-[#1c1c1f]">
      {kind === 'video' ? (
        <video
          src={item.previewUrl || item.publicUrl}
          className="h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : kind === 'image' ? (
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
        onClick={onRemove}
        className="absolute right-1 top-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

function Dropzone({
  uploading,
  dragOver,
  onBrowse,
  onDragState,
  onDropFiles,
}: {
  uploading: boolean
  dragOver: boolean
  onBrowse: () => void
  onDragState: (v: boolean) => void
  onDropFiles: (files: FileList) => void
}) {
  return (
    <button
      type="button"
      disabled={uploading}
      onClick={onBrowse}
      onDragEnter={(e) => {
        e.preventDefault()
        onDragState(true)
      }}
      onDragOver={(e) => {
        e.preventDefault()
        onDragState(true)
      }}
      onDragLeave={(e) => {
        e.preventDefault()
        onDragState(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        onDragState(false)
        if (e.dataTransfer.files?.length) onDropFiles(e.dataTransfer.files)
      }}
      className={`flex size-[7.5rem] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-2 text-center text-sm leading-tight transition ${
        dragOver
          ? 'border-[#7c5cff] bg-[#7c5cff]/10 text-white'
          : 'border-white/20 text-white/50 hover:border-white/40 hover:bg-white/[0.04] hover:text-white/80'
      } disabled:opacity-50`}
    >
      {uploading ? (
        <span className="text-[11px] font-medium">Uploading…</span>
      ) : (
        <>
          <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 8h.01M12.5 21H6a3 3 0 01-3-3V6a3 3 0 013-3h12a3 3 0 013 3v6.5M3 16l5-5c.928-.893 2.072-.893 3 0l4 4M14 14l1-1c.67-.644 1.45-.824 2.182-.54M16 19h6M19 16v6"
            />
          </svg>
          <span className="text-[11px]">
            Drag & drop or <span className="text-[#a78bfa]">select a file</span>
          </span>
        </>
      )}
    </button>
  )
}

function MediaSourceMenu({
  open,
  onClose,
  onUploadDevice,
  onChooseLibrary,
  onChooseTelegram,
  anchorRef,
}: {
  open: boolean
  onClose: () => void
  onUploadDevice: () => void
  onChooseLibrary: () => void
  onChooseTelegram: () => void
  anchorRef: RefObject<HTMLDivElement | null>
}) {
  useEffect(() => {
    if (!open) return
    const onPointer = (e: MouseEvent) => {
      if (anchorRef.current && !anchorRef.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', onPointer)
    return () => window.removeEventListener('mousedown', onPointer)
  }, [open, onClose, anchorRef])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 2, scale: 0.98 }}
          transition={{ duration: 0.12 }}
          className="absolute bottom-[calc(100%+6px)] left-0 z-40 min-w-[220px] overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f] py-1 shadow-2xl"
        >
          <button
            type="button"
            onClick={() => {
              onUploadDevice()
              onClose()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white/85 hover:bg-white/5"
          >
            <svg className="h-4 w-4 shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 12V4m0 0l-3 3m3-3l3 3"
              />
            </svg>
            Upload from device
          </button>
          <button
            type="button"
            onClick={() => {
              onChooseLibrary()
              onClose()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white/85 hover:bg-white/5"
          >
            <svg className="h-4 w-4 shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
              />
            </svg>
            Choose from media library
          </button>
          <button
            type="button"
            onClick={() => {
              onChooseTelegram()
              onClose()
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-white/85 hover:bg-white/5"
          >
            <svg className="h-4 w-4 shrink-0 text-white/50" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"
              />
            </svg>
            Choose from Telegram
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function PreviewEmpty() {
  return (
    <div className="flex min-h-64 flex-1 flex-col items-center justify-center p-8 text-center">
      <div className="mb-5 flex -space-x-4 opacity-50">
        <div className="h-20 w-14 rotate-[-8deg] rounded-xl border border-white/10 bg-[#1c1c1f]" />
        <div className="z-10 h-24 w-16 rounded-xl border border-white/15 bg-[#222226]" />
        <div className="h-20 w-14 rotate-[8deg] rounded-xl border border-white/10 bg-[#1c1c1f]" />
      </div>
      <h3 className="text-sm font-medium text-white/80">Your post preview will appear here.</h3>
    </div>
  )
}

function PreviewCard({
  channel,
  content,
  media,
}: {
  channel: TryPostSocialAccount
  content: string
  media: UploadedMedia[]
}) {
  const first = media[0]
  return (
    <div className="rounded-xl border border-white/10 bg-[#1c1c1f] p-3 text-left">
      <div className="mb-2 flex items-center gap-2">
        <SocialAccountAvatar channel={channel} size="sm" />
        <div className="min-w-0 text-xs text-white/60">
          <div className="truncate font-semibold text-white/90">{channelTitle(channel)}</div>
          <div className="truncate">
            {platformLabel(channel.platform)}
            {channel.username ? ` · @${channel.username}` : ''}
          </div>
        </div>
      </div>
      {first &&
        (mediaKind(first) === 'video' ? (
          <video
            src={first.previewUrl || first.publicUrl}
            className="mb-2 aspect-square w-full rounded-lg object-cover bg-black/40"
            muted
            playsInline
            controls
          />
        ) : mediaKind(first) === 'image' ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={first.previewUrl || first.publicUrl}
            alt=""
            className="mb-2 aspect-square w-full rounded-lg object-cover bg-black/40"
          />
        ) : null)}
      {content.trim() ? (
        <p className="whitespace-pre-wrap text-sm text-white/85">{content}</p>
      ) : (
        <p className="text-sm text-white/35">{first ? '(media only)' : 'Nothing to preview yet'}</p>
      )}
    </div>
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

  const [step, setStep] = useState<ComposerStep>('shared')
  const [viewMode, setViewMode] = useState<ViewMode>('edit')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [sharedContent, setSharedContent] = useState('')
  const [sharedMedia, setSharedMedia] = useState<UploadedMedia[]>([])
  const [drafts, setDrafts] = useState<Record<string, DestinationDraft>>({})
  const [publishMode, setPublishMode] = useState<TryPostPublishMode>('queue_next')
  const [scheduledAt, setScheduledAt] = useState('')
  const [createAnother, setCreateAnother] = useState(false)
  const [showPreview, setShowPreview] = useState(true)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [channelQuery, setChannelQuery] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [mediaMenuOpen, setMediaMenuOpen] = useState(false)
  const [mediaTarget, setMediaTarget] = useState<'shared' | string>('shared')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [telegramOpen, setTelegramOpen] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const scheduleRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const captionRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const sharedMediaMenuRef = useRef<HTMLDivElement>(null)
  const customizeMediaMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const ids = connected.map((c) => c.id)
    setSelectedIds(ids)
    setActiveAccountId(ids[0] ?? null)
    setSharedContent('')
    setSharedMedia([])
    setDrafts({})
    setStep('shared')
    setViewMode('edit')
    setPublishMode(initialDateKey ? 'scheduled' : 'queue_next')
    setScheduledAt(initialDateKey ? `${initialDateKey}T10:00` : '')
    setCreateAnother(false)
    setError(null)
    setPickerOpen(false)
    setScheduleOpen(false)
    setChannelQuery('')
    setUploading(false)
    setDragOver(false)
    setShowPreview(true)
    setExpanded(false)
    setMediaMenuOpen(false)
    setLibraryOpen(false)
    setTelegramOpen(false)
    setMediaTarget('shared')
  }, [open, connected, initialDateKey])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (scheduleOpen) setScheduleOpen(false)
        else if (pickerOpen) setPickerOpen(false)
        else if (step === 'customize') setStep('shared')
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prevOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, pickerOpen, scheduleOpen, step])

  useEffect(() => {
    if (!pickerOpen) return
    const onPointer = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    queueMicrotask(() => searchRef.current?.focus())
    return () => window.removeEventListener('mousedown', onPointer)
  }, [pickerOpen])

  useEffect(() => {
    if (!scheduleOpen) return
    const onPointer = (e: MouseEvent) => {
      if (scheduleRef.current && !scheduleRef.current.contains(e.target as Node)) setScheduleOpen(false)
    }
    window.addEventListener('mousedown', onPointer)
    return () => window.removeEventListener('mousedown', onPointer)
  }, [scheduleOpen])

  const selectedChannels = useMemo(
    () => connected.filter((c) => selectedIds.includes(c.id)),
    [connected, selectedIds]
  )

  const filteredChannels = useMemo(() => {
    const q = channelQuery.trim().toLowerCase()
    if (!q) return connected
    return connected.filter((c) => {
      const hay = `${c.display_name ?? ''} ${c.username ?? ''} ${c.platform}`.toLowerCase()
      return hay.includes(q)
    })
  }, [connected, channelQuery])

  const ensureDraft = (ch: TryPostSocialAccount): DestinationDraft => {
    const existing = drafts[ch.id]
    if (existing) return existing
    return emptyDraft(ch.platform, sharedContent, sharedMedia)
  }

  const getDraftMedia = (ch: TryPostSocialAccount) => {
    const d = ensureDraft(ch)
    return d.useSharedMedia ? sharedMedia : d.mediaItems
  }

  const getDraftContent = (ch: TryPostSocialAccount) => {
    const d = ensureDraft(ch)
    return d.useSharedContent ? sharedContent : d.content
  }

  const forPublish = publishMode !== 'draft' && publishMode !== 'pending_approval'

  const issuesByAccount = useMemo(() => {
    const map: Record<string, ComposerIssue[]> = {}
    for (const ch of selectedChannels) {
      const draft = drafts[ch.id] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
      const media = draft.useSharedMedia ? sharedMedia : draft.mediaItems
      const content = draft.useSharedContent ? sharedContent : draft.content
      map[ch.id] = collectDestinationIssues({
        platform: ch.platform,
        content,
        contentType: draft.contentType,
        mediaCount: media.length,
        mediaKinds: media.map(mediaKind),
        meta: draft.meta,
        accountMaxLength: ch.max_content_length || getPlatformRules(ch.platform).max_content_length,
        forPublish,
      })
    }
    return map
  }, [selectedChannels, drafts, sharedContent, sharedMedia, forPublish])

  const allIssues = useMemo(() => Object.values(issuesByAccount).flat(), [issuesByAccount])
  const blockingIssues = allIssues.filter((i) => i.severity === 'error' || (forPublish && i.severity === 'warning'))
  const canSubmitPublish = selectedChannels.length > 0 && blockingIssues.length === 0 && !uploading

  const toggleChannel = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      if (!next.includes(activeAccountId ?? '')) setActiveAccountId(next[0] ?? null)
      return next
    })
  }

  const removeSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.filter((x) => x !== id)
      if (activeAccountId === id) setActiveAccountId(next[0] ?? null)
      return next
    })
    setDrafts((prev) => {
      const copy = { ...prev }
      delete copy[id]
      return copy
    })
  }

  const patchDraft = (id: string, patch: Partial<DestinationDraft>) => {
    setDrafts((prev) => {
      const ch = connected.find((c) => c.id === id)
      if (!ch) return prev
      const base = prev[id] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
      return { ...prev, [id]: { ...base, ...patch } }
    })
  }

  const enterCustomize = () => {
    if (!selectedIds.length) {
      setError('Select at least one channel.')
      return
    }
    const next: Record<string, DestinationDraft> = {}
    for (const ch of selectedChannels) {
      next[ch.id] = drafts[ch.id] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
      if (next[ch.id]!.useSharedContent) next[ch.id]!.content = sharedContent
      if (next[ch.id]!.useSharedMedia) next[ch.id]!.mediaItems = [...sharedMedia]
      next[ch.id]!.contentType =
        next[ch.id]!.contentType ||
        defaultContentTypeForPlatform(
          ch.platform,
          (next[ch.id]!.useSharedMedia ? sharedMedia : next[ch.id]!.mediaItems).map(mediaKind)
        )
      if (ch.platform === 'tiktok' && !next[ch.id]!.meta.privacy_level) {
        next[ch.id]!.meta = { ...next[ch.id]!.meta, privacy_level: 'PUBLIC_TO_EVERYONE' }
      }
    }
    setDrafts(next)
    setActiveAccountId(selectedChannels[0]?.id ?? null)
    setStep('customize')
    setViewMode('edit')
    setError(null)
  }

  const uploadFiles = async (
    files: FileList | File[],
    target: 'shared' | string
  ) => {
    const list = Array.from(files)
    if (!list.length) return
    setError(null)
    setUploading(true)
    try {
      for (const file of list) {
        const localPreview =
          file.type.startsWith('image/') || file.type.startsWith('video/')
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
        const asset = { ...(json.asset as UploadedMedia), previewUrl: localPreview }
        if (target === 'shared') {
          setSharedMedia((prev) => [...prev, asset])
        } else {
          setDrafts((prev) => {
            const ch = connected.find((c) => c.id === target)
            if (!ch) return prev
            const base = prev[target] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
            const current = base.useSharedMedia ? sharedMedia : base.mediaItems
            return {
              ...prev,
              [target]: {
                ...base,
                useSharedMedia: false,
                mediaItems: [...current, asset],
              },
            }
          })
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeSharedMedia = (id: string) => {
    setSharedMedia((prev) => {
      const target = prev.find((m) => m.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((m) => m.id !== id)
    })
  }

  const removeDraftMedia = (accountId: string, mediaId: string) => {
    const draft = drafts[accountId]
    const list = draft?.useSharedMedia ? sharedMedia : draft?.mediaItems ?? []
    const target = list.find((m) => m.id === mediaId)
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    patchDraft(accountId, {
      useSharedMedia: false,
      mediaItems: list.filter((m) => m.id !== mediaId),
    })
  }

  const openMediaMenu = (target: 'shared' | string) => {
    setMediaTarget(target)
    setMediaMenuOpen(true)
  }

  const openDevicePicker = (target: 'shared' | string = mediaTarget) => {
    if (target !== 'shared') {
      fileInputRef.current?.setAttribute('data-target', target)
    } else {
      fileInputRef.current?.removeAttribute('data-target')
    }
    fileInputRef.current?.click()
  }

  const attachLibraryAssets = (assets: LibraryMediaAsset[]) => {
    if (!assets.length) return
    const mapped: UploadedMedia[] = assets.map((a) => ({
      id: a.id,
      publicUrl: a.publicUrl,
      mediaType: a.mediaType,
      mimeType: a.mimeType || (a.mediaType === 'video' ? 'video/mp4' : a.mediaType === 'pdf' ? 'application/pdf' : 'image/jpeg'),
      originalFilename: a.originalFilename || a.title,
    }))

    if (mediaTarget === 'shared') {
      setSharedMedia((prev) => {
        const urls = new Set(prev.map((m) => m.publicUrl))
        return [...prev, ...mapped.filter((m) => !urls.has(m.publicUrl))]
      })
      return
    }

    setDrafts((prev) => {
      const ch = connected.find((c) => c.id === mediaTarget)
      if (!ch) return prev
      const base = prev[mediaTarget] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
      const current = base.useSharedMedia ? sharedMedia : base.mediaItems
      const urls = new Set(current.map((m) => m.publicUrl))
      return {
        ...prev,
        [mediaTarget]: {
          ...base,
          useSharedMedia: false,
          mediaItems: [...current, ...mapped.filter((m) => !urls.has(m.publicUrl))],
        },
      }
    })
  }

  const librarySelectedUrls = (() => {
    if (mediaTarget === 'shared') return sharedMedia.map((m) => m.publicUrl)
    const ch = connected.find((c) => c.id === mediaTarget)
    if (!ch) return [] as string[]
    return getDraftMedia(ch).map((m) => m.publicUrl)
  })()

  const insertEmoji = (accountId: string | 'shared', emoji: string) => {
    if (accountId === 'shared') {
      setSharedContent((prev) => prev + emoji)
      return
    }
    const current = getDraftContent(connected.find((c) => c.id === accountId)!)
    patchDraft(accountId, { useSharedContent: false, content: current + emoji })
  }

  const resolveDraftsForSubmit = (): Record<string, DestinationDraft> => {
    const next: Record<string, DestinationDraft> = {}
    for (const ch of selectedChannels) {
      const existing = drafts[ch.id]
      if (existing) {
        next[ch.id] = {
          ...existing,
          content: existing.useSharedContent ? sharedContent : existing.content,
          mediaItems: existing.useSharedMedia ? [...sharedMedia] : existing.mediaItems,
        }
      } else {
        next[ch.id] = emptyDraft(ch.platform, sharedContent, sharedMedia)
      }
    }
    return next
  }

  const buildDestinationsFrom = (
    source: Record<string, DestinationDraft>
  ): CreatePostDestinationPayload[] => {
    return selectedChannels.map((ch) => {
      const draft = source[ch.id] ?? emptyDraft(ch.platform, sharedContent, sharedMedia)
      const content = draft.useSharedContent ? sharedContent : draft.content
      const media = draft.useSharedMedia ? sharedMedia : draft.mediaItems
      const typeRule = getContentTypeRule(ch.platform, draft.contentType)
      const meta = { ...draft.meta }
      // Drop empty optional meta keys
      for (const key of Object.keys(meta)) {
        if (meta[key] === undefined || meta[key] === '' || meta[key] === null) delete meta[key]
      }
      if (Array.isArray(meta.collaborators) && meta.collaborators.length === 0) {
        delete meta.collaborators
      }
      return {
        socialAccountId: ch.id,
        content: typeRule?.captionless ? '' : content,
        contentType: draft.contentType || null,
        mediaUrls: media.map((m) => m.publicUrl),
        meta: Object.keys(meta).length ? meta : undefined,
      }
    })
  }

  const submit = async (mode: TryPostPublishMode = publishMode) => {
    setError(null)
    if (!selectedIds.length) {
      setError('Select at least one channel.')
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

    const resolvedDrafts = resolveDraftsForSubmit()
    setDrafts(resolvedDrafts)
    const destinations = buildDestinationsFrom(resolvedDrafts)
    const publishCheck = mode !== 'draft' && mode !== 'pending_approval'
    if (publishCheck) {
      for (const ch of selectedChannels) {
        const dest = destinations.find((d) => d.socialAccountId === ch.id)!
        const draft = resolvedDrafts[ch.id]!
        const media = draft.useSharedMedia ? sharedMedia : draft.mediaItems
        const realIssues = collectDestinationIssues({
          platform: ch.platform,
          content: dest.content ?? '',
          contentType: dest.contentType ?? '',
          mediaCount: media.length,
          mediaKinds: media.map(mediaKind),
          meta: dest.meta ?? {},
          accountMaxLength: ch.max_content_length,
          forPublish: true,
        })
        if (realIssues.some((i) => i.severity === 'error' || i.severity === 'warning')) {
          setError(realIssues[0]?.message ?? 'Fix channel issues before publishing.')
          if (step === 'shared' && selectedChannels.length > 1) {
            enterCustomize()
          } else {
            setStep('customize')
            setActiveAccountId(ch.id)
          }
          return
        }
      }
    }

    try {
      await onSubmit({
        content: sharedContent,
        socialAccountIds: selectedIds,
        publishMode: mode,
        scheduledAt: mode === 'scheduled' ? new Date(scheduledAt).toISOString() : null,
        mediaUrls: sharedMedia.map((m) => m.publicUrl),
        createAnother,
        destinations,
      })
      if (createAnother) {
        sharedMedia.forEach((m) => m.previewUrl && URL.revokeObjectURL(m.previewUrl))
        setSharedContent('')
        setSharedMedia([])
        setDrafts({})
        setStep('shared')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
    }
  }

  const primaryLabel = (() => {
    if (step === 'shared' && selectedChannels.length > 1) return 'Customize for each network →'
    if (saving) return 'Working…'
    const n = selectedChannels.length
    if (publishMode === 'now') return n > 1 ? `Publish ${n}` : 'Publish now'
    if (publishMode === 'draft') return n > 1 ? `Save ${n} drafts` : 'Save draft'
    if (publishMode === 'scheduled') return n > 1 ? `Schedule ${n}` : 'Schedule'
    return n > 1 ? `Add ${n} to queue` : 'Add to queue'
  })()

  const activeChannel = selectedChannels.find((c) => c.id === activeAccountId) ?? selectedChannels[0]
  const activeDraft = activeChannel ? ensureDraft(activeChannel) : null
  const activeMedia = activeChannel ? getDraftMedia(activeChannel) : []
  const activeContent = activeChannel ? getDraftContent(activeChannel) : ''
  const activeIssues = activeChannel ? issuesByAccount[activeChannel.id] ?? [] : []
  const activeTypeRule = activeChannel
    ? getContentTypeRule(activeChannel.platform, activeDraft?.contentType ?? '')
    : null

  const aggregatedError =
    step === 'shared' && allIssues.length
      ? `${allIssues[0]!.message}${allIssues.length > 1 ? ` (and ${allIssues.length - 1} more)` : ''}`
      : null

  if (!mounted) return null

  const dialogWidth = expanded
    ? 'sm:w-[min(1280px,calc(100vw-1.5rem))] sm:max-h-[min(888px,calc(100dvh-1.5rem))]'
    : showPreview || step === 'customize'
      ? 'sm:w-[min(1100px,calc(100vw-1.5rem))] sm:max-h-[min(888px,calc(100dvh-1.5rem))]'
      : 'sm:w-[min(720px,calc(100vw-1.5rem))] sm:max-h-[min(888px,calc(100dvh-1.5rem))]'

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-0 sm:p-3"
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
            data-testid="post-composer-dialog"
            className={`flex h-dvh w-screen flex-col overflow-hidden rounded-none border border-white/10 bg-[#141416] text-white shadow-2xl sm:h-[calc(100dvh-1.5rem)] sm:rounded-2xl ${dialogWidth}`}
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Header */}
            <header className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3 sm:min-h-16 sm:px-8">
              <div className="flex min-w-0 items-center gap-3">
                {step === 'customize' && (
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setStep('shared')}
                    className="flex size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/5 hover:text-white"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12l6 6M5 12l6-6" />
                    </svg>
                  </button>
                )}
                <h2 id="create-post-title" className="text-lg font-medium leading-tight">
                  Create a new post
                </h2>
                <button
                  type="button"
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-white/15 px-3 text-sm text-white/80 hover:bg-white/5"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6.5 7.5a1 1 0 102 0 1 1 0 00-2 0M3 6v5.172a2 2 0 00.586 1.414l7.71 7.71a2.41 2.41 0 003.408 0l5.592-5.592a2.41 2.41 0 000-3.408l-7.71-7.71A2 2 0 0011.172 3H6a3 3 0 00-3 3"
                    />
                  </svg>
                  <span className="max-sm:sr-only">Labels</span>
                </button>
              </div>
              <div className="ms-auto flex items-center gap-1 sm:gap-2">
                {step === 'customize' ? (
                  <>
                    <button
                      type="button"
                      className="hidden h-8 items-center gap-1 rounded-lg px-3 text-sm text-white/55 hover:bg-white/5 hover:text-white/80 lg:inline-flex"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h4a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM14 12h6M14 16h6M14 20h6"
                        />
                      </svg>
                      <span className="max-lg:sr-only">Templates</span>
                    </button>
                    <button
                      type="button"
                      className="hidden h-8 items-center gap-1 rounded-lg px-3 text-sm text-white/55 hover:bg-white/5 hover:text-white/80 lg:inline-flex"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 21l15-15-3-3L3 18l3 3M15 6l3 3M9 3a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2M19 13a2 2 0 012 2 2 2 0 01-2 2 2 2 0 01-2-2 2 2 0 012-2"
                        />
                      </svg>
                      <span className="max-lg:sr-only">AI Assistant</span>
                    </button>
                    <button
                      type="button"
                      aria-pressed={showPreview}
                      onClick={() => setShowPreview((v) => !v)}
                      className={`hidden h-8 items-center gap-1 rounded-lg px-3 text-sm lg:inline-flex ${
                        showPreview
                          ? 'bg-[#7c5cff]/20 text-[#c4b5fd]'
                          : 'text-white/55 hover:bg-white/5 hover:text-white/80'
                      }`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M10 12a2 2 0 104 0 2 2 0 00-4 0M21 12c-2.4 4-5.4 6-9 6s-6.6-2-9-6c2.4-4 5.4-6 9-6s6.6 2 9 6"
                        />
                      </svg>
                      <span>Preview</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowPreview((v) => !v)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
                      showPreview ? 'bg-[#7c5cff] text-white' : 'border border-white/15 text-white/70'
                    }`}
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M10 12a2 2 0 104 0 2 2 0 00-4 0M21 12c-2.4 4-5.4 6-9 6s-6.6-2-9-6c2.4-4 5.4-6 9-6s6.6 2 9 6"
                      />
                    </svg>
                    Preview
                  </button>
                )}
                <button
                  type="button"
                  aria-label={expanded ? 'Shrink dialog' : 'Expand dialog'}
                  onClick={() => setExpanded((v) => !v)}
                  className="hidden size-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white sm:inline-flex"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16 4h4v4M14 10l6-6M8 20H4v-4M4 20l6-6M16 20h4v-4M14 14l6 6M8 4H4v4M4 4l6 6"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onClick={onClose}
                  className="flex size-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/5 hover:text-white"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            {/* Edit / Preview switch (customize step, mobile-friendly) */}
            {step === 'customize' && (
              <div className="shrink-0 border-b border-white/10 px-4 py-2 sm:px-8 lg:hidden">
                <div className="mx-auto flex h-9 w-full max-w-[744px] items-center gap-1 rounded-lg border border-white/15 bg-[#1c1c1f] p-[3px]">
                  <button
                    type="button"
                    aria-pressed={viewMode === 'edit'}
                    onClick={() => setViewMode('edit')}
                    className={`inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium ${
                      viewMode === 'edit' ? 'bg-[#7c5cff]/25 text-[#c4b5fd]' : 'text-white/70 hover:bg-white/5'
                    }`}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    aria-pressed={viewMode === 'preview'}
                    onClick={() => setViewMode('preview')}
                    className={`inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium ${
                      viewMode === 'preview' ? 'bg-[#7c5cff]/25 text-[#c4b5fd]' : 'text-white/70 hover:bg-white/5'
                    }`}
                  >
                    Preview
                  </button>
                </div>
              </div>
            )}

            <div
              className={`flex min-h-0 flex-1 flex-col ${
                showPreview || step === 'customize' ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_400px]' : ''
              }`}
            >
              {/* Editor column */}
              <div
                className={`flex min-h-0 flex-1 flex-col ${
                  step === 'customize' && viewMode === 'preview' ? 'max-lg:hidden' : ''
                }`}
              >
                <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pt-4 pb-5 sm:px-8">
                  {/* Accounts */}
                  <div className="relative mx-auto flex h-12 w-full max-w-[744px] shrink-0 items-center gap-2" ref={pickerRef}>
                    <div className="-my-3 flex min-w-0 gap-3 overflow-x-auto py-3 pe-2">
                      {selectedChannels.map((ch) => (
                        <div key={ch.id} className="group relative shrink-0">
                          <button
                            type="button"
                            aria-pressed={
                              step === 'customize' ? activeAccountId === ch.id : selectedIds.includes(ch.id)
                            }
                            onClick={() => {
                              if (step === 'customize') setActiveAccountId(ch.id)
                              else setPickerOpen(true)
                            }}
                            title={`${channelTitle(ch)} · ${platformLabel(ch.platform)}`}
                          >
                            <SocialAccountAvatar
                              channel={ch}
                              selected={
                                step === 'customize' ? activeAccountId === ch.id : true
                              }
                            />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${channelTitle(ch)}`}
                            onClick={() => removeSelected(ch.id)}
                            className="absolute -right-2.5 -top-2 z-10 flex size-6 items-center justify-center rounded-md border border-white/15 bg-[#141416] text-white/50 opacity-100 transition hover:bg-white/10 sm:opacity-0 sm:group-hover:opacity-100"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickerOpen((v) => !v)}
                      aria-label="Select Platforms"
                      className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
                      </svg>
                    </button>

                    <AnimatePresence>
                      {pickerOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: 6, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 4, scale: 0.98 }}
                          transition={{ duration: 0.15 }}
                          className="absolute left-0 top-[3.25rem] z-30 w-[min(100%,320px)] overflow-hidden rounded-2xl border border-white/10 bg-[#1c1c1f] shadow-2xl"
                        >
                          <div className="border-b border-white/10 p-2.5">
                            <input
                              ref={searchRef}
                              value={channelQuery}
                              onChange={(e) => setChannelQuery(e.target.value)}
                              placeholder="Search channels…"
                              className="w-full rounded-lg border border-white/10 bg-[#141416] px-3 py-2 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50"
                            />
                          </div>
                          <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-xs font-medium text-white/45">Channels</span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedIds([])
                                setActiveAccountId(null)
                              }}
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
                                    <SocialAccountAvatar channel={ch} size="sm" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-sm font-medium">{channelTitle(ch)}</span>
                                      <span className="block truncate text-xs text-white/45">
                                        {platformLabel(ch.platform)}
                                        {ch.username ? ` · @${ch.username}` : ''}
                                      </span>
                                    </span>
                                    <span
                                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                                        active
                                          ? 'border-[#7c5cff] bg-[#7c5cff] text-white'
                                          : 'border-white/20 text-transparent'
                                      }`}
                                    >
                                      <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
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

                  {/* SHARED STEP */}
                  {step === 'shared' && (
                    <div className="mx-auto flex w-full max-w-[744px] flex-1 flex-col gap-3">
                      <textarea
                        value={sharedContent}
                        onChange={(e) => setSharedContent(e.target.value)}
                        rows={7}
                        placeholder="Start writing or get inspired with Templates."
                        className="min-h-40 w-full flex-1 resize-none rounded-xl border border-white/10 bg-[#1c1c1f] px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-[#7c5cff]/60"
                      />

                      <div className="flex flex-wrap items-end gap-3">
                        {sharedMedia.map((item) => (
                          <MediaThumb key={item.id} item={item} onRemove={() => removeSharedMedia(item.id)} />
                        ))}
                        <div className="relative flex flex-col gap-2" ref={sharedMediaMenuRef}>
                          <Dropzone
                            uploading={uploading}
                            dragOver={dragOver}
                            onBrowse={() => openMediaMenu('shared')}
                            onDragState={setDragOver}
                            onDropFiles={(files) => void uploadFiles(files, 'shared')}
                          />
                          <MediaSourceMenu
                            open={mediaMenuOpen && mediaTarget === 'shared'}
                            onClose={() => setMediaMenuOpen(false)}
                            onUploadDevice={() => openDevicePicker('shared')}
                            onChooseLibrary={() => setLibraryOpen(true)}
                            onChooseTelegram={() => setTelegramOpen(true)}
                            anchorRef={sharedMediaMenuRef}
                          />
                          <div className="flex items-center justify-center gap-1 text-white/45">
                            <button
                              type="button"
                              onClick={() => openMediaMenu('shared')}
                              className="flex size-8 items-center justify-center rounded-lg hover:bg-white/5 hover:text-white/80"
                              aria-label="Add media"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M15 8h.01M12.5 21H6a3 3 0 01-3-3V6a3 3 0 013-3h12a3 3 0 013 3v6.5M3 16l5-5c.928-.893 2.072-.893 3 0l4 4M14 14l1-1c.67-.644 1.45-.824 2.182-.54M16 19h6M19 16v6"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => insertEmoji('shared', '✨')}
                              className="flex size-8 items-center justify-center rounded-lg hover:bg-white/5 hover:text-white/80"
                              aria-label="Insert emoji"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M12 21a9 9 0 100-18 9 9 0 000 18zM9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0"
                                />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>

                      {(error || aggregatedError) && (
                        <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
                          {error || aggregatedError}
                        </p>
                      )}
                    </div>
                  )}

                  {/* CUSTOMIZE STEP — accordion */}
                  {step === 'customize' && (
                    <div className="mx-auto flex w-full max-w-[744px] flex-1 flex-col gap-3">
                      {selectedChannels.map((ch) => {
                        const isActive = ch.id === (activeAccountId ?? selectedChannels[0]?.id)
                        const issues = issuesByAccount[ch.id] ?? []
                        const draft = ensureDraft(ch)

                        if (!isActive) {
                          return (
                            <button
                              key={ch.id}
                              type="button"
                              onClick={() => setActiveAccountId(ch.id)}
                              className="flex min-h-[50px] w-full items-center gap-3 rounded-xl border border-white/10 bg-[#1c1c1f] px-3 py-1 text-start transition hover:bg-white/[0.04]"
                            >
                              <PlatformLogoMark platform={ch.platform} />
                              <span className="min-w-0 flex-1 truncate text-sm text-white/55">
                                {channelTitle(ch)}
                              </span>
                              {issues.length > 0 && (
                                <span className="flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 9v4M10.363 3.591l-8.106 13.534a1.914 1.914 0 001.636 2.871h16.214a1.914 1.914 0 001.636-2.87L13.637 3.59a1.914 1.914 0 00-3.274 0M12 16h.01"
                                    />
                                  </svg>
                                  {issues.length}
                                </span>
                              )}
                            </button>
                          )
                        }

                        const content = getDraftContent(ch)
                        const media = getDraftMedia(ch)
                        const rules = getPlatformRules(ch.platform)
                        const typeRule = getContentTypeRule(ch.platform, draft.contentType)
                        const remaining =
                          (ch.max_content_length || rules.max_content_length) -
                          (typeRule?.captionless ? 0 : content.length)
                        const tagsLeft =
                          rules.max_hashtags != null
                            ? Math.max(0, rules.max_hashtags - countHashtags(content))
                            : null
                        const collaborators = Array.isArray(draft.meta.collaborators)
                          ? (draft.meta.collaborators as string[])
                          : []

                        return (
                          <div
                            key={ch.id}
                            className="flex min-h-64 flex-1 gap-3 rounded-xl border border-white/10 bg-[#1c1c1f] p-3"
                          >
                            <PlatformLogoMark platform={ch.platform} />
                            <div className="flex min-w-0 flex-1 flex-col gap-4">
                              {/* Content type radios */}
                              {rules.content_types.length > 1 && (
                                <div
                                  role="radiogroup"
                                  aria-label="Choose a format"
                                  className="flex min-h-6 flex-wrap items-center gap-x-5 gap-y-2"
                                >
                                  {rules.content_types.map((ct) => (
                                    <label
                                      key={ct.value}
                                      className="flex cursor-pointer items-center gap-2 text-sm text-white"
                                    >
                                      <button
                                        type="button"
                                        role="radio"
                                        aria-checked={draft.contentType === ct.value}
                                        onClick={() =>
                                          patchDraft(ch.id, { contentType: ct.value })
                                        }
                                        className={`aspect-square size-4 rounded-full border shadow-xs ${
                                          draft.contentType === ct.value
                                            ? 'border-[#a78bfa] bg-[radial-gradient(circle,#a78bfa_3.5px,transparent_4px)]'
                                            : 'border-white/25'
                                        }`}
                                      />
                                      <span>{ct.label}</span>
                                    </label>
                                  ))}
                                </div>
                              )}

                              {activeIssues
                                .filter((i) => i.severity === 'warning')
                                .slice(0, 1)
                                .map((issue) => (
                                  <div
                                    key={issue.message}
                                    role="status"
                                    className="flex items-center gap-2 rounded-md bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200"
                                  >
                                    <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M12 9v4M10.363 3.591l-8.106 13.534a1.914 1.914 0 001.636 2.871h16.214a1.914 1.914 0 001.636-2.87L13.637 3.59a1.914 1.914 0 00-3.274 0M12 16h.01"
                                      />
                                    </svg>
                                    {issue.message}
                                  </div>
                                ))}

                              {!typeRule?.captionless && (
                                <div className="relative flex min-h-40 flex-1 flex-col">
                                  <label className="sr-only" htmlFor={`composer-caption-${ch.id}`}>
                                    Post content
                                  </label>
                                  <textarea
                                    id={`composer-caption-${ch.id}`}
                                    ref={(el) => {
                                      captionRefs.current[ch.id] = el
                                    }}
                                    value={content}
                                    onChange={(e) =>
                                      patchDraft(ch.id, {
                                        useSharedContent: false,
                                        content: e.target.value,
                                      })
                                    }
                                    className="min-h-40 w-full flex-1 resize-none bg-transparent px-[9px] pt-0.5 pb-1 text-sm text-white outline-none"
                                  />
                                  {!content && (
                                    <p className="pointer-events-none absolute start-0 top-0 px-[9px] pt-0.5 text-sm text-white/35">
                                      Start writing or get inspired with{' '}
                                      <span className="font-medium text-[#a78bfa]">Templates</span>
                                    </p>
                                  )}
                                </div>
                              )}

                              <div className="relative flex flex-wrap gap-3" ref={customizeMediaMenuRef}>
                                {media.map((item) => (
                                  <MediaThumb
                                    key={item.id}
                                    item={item}
                                    onRemove={() => removeDraftMedia(ch.id, item.id)}
                                  />
                                ))}
                                <Dropzone
                                  uploading={uploading}
                                  dragOver={dragOver}
                                  onBrowse={() => openMediaMenu(ch.id)}
                                  onDragState={setDragOver}
                                  onDropFiles={(files) => void uploadFiles(files, ch.id)}
                                />
                                <MediaSourceMenu
                                  open={mediaMenuOpen && mediaTarget === ch.id}
                                  onClose={() => setMediaMenuOpen(false)}
                                  onUploadDevice={() => openDevicePicker(ch.id)}
                                  onChooseLibrary={() => setLibraryOpen(true)}
                                  onChooseTelegram={() => setTelegramOpen(true)}
                                  anchorRef={customizeMediaMenuRef}
                                />
                              </div>

                              <div className="flex flex-wrap items-center gap-y-1 pt-1">
                                <button
                                  type="button"
                                  onClick={() => openMediaMenu(ch.id)}
                                  className="flex size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/5"
                                  aria-label="Add media"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M15 8h.01M12.5 21H6a3 3 0 01-3-3V6a3 3 0 013-3h12a3 3 0 013 3v6.5M3 16l5-5c.928-.893 2.072-.893 3 0l4 4M14 14l1-1c.67-.644 1.45-.824 2.182-.54M16 19h6M19 16v6"
                                    />
                                  </svg>
                                </button>
                                <span className="mx-1.5 h-6 w-px bg-white/10" />
                                <button
                                  type="button"
                                  onClick={() => insertEmoji(ch.id, '✨')}
                                  className="flex size-8 items-center justify-center rounded-lg text-white/70 hover:bg-white/5"
                                  aria-label="Insert emoji"
                                >
                                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M12 21a9 9 0 100-18 9 9 0 000 18zM9 10h.01M15 10h.01M9.5 15a3.5 3.5 0 005 0"
                                    />
                                  </svg>
                                </button>
                                <div className="ms-auto flex items-center gap-3 pe-1">
                                  <span className="text-xs tabular-nums text-white/45">{remaining}</span>
                                  {tagsLeft != null && (
                                    <span className="text-xs tabular-nums text-white/45">
                                      # Remaining: {tagsLeft}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Network settings */}
                              {(ch.platform === 'tiktok' ||
                                ch.platform === 'instagram' ||
                                ch.platform === 'instagram-facebook' ||
                                ch.platform === 'youtube') && (
                                <div className="space-y-4 border-t border-white/10 pt-4">
                                  {ch.platform === 'tiktok' && (
                                    <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center sm:gap-3">
                                      <span className="text-[13px] font-medium">Privacy</span>
                                      <select
                                        value={String(draft.meta.privacy_level ?? '')}
                                        onChange={(e) =>
                                          patchDraft(ch.id, {
                                            meta: {
                                              ...draft.meta,
                                              privacy_level: e.target.value || undefined,
                                            },
                                          })
                                        }
                                        className="h-8 w-full rounded-md border border-white/15 bg-[#141416] px-2 text-sm text-white outline-none"
                                      >
                                        <option value="">Select privacy level</option>
                                        {TIKTOK_PRIVACY_OPTIONS.map((opt) => (
                                          <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  )}

                                  {(ch.platform === 'instagram' ||
                                    ch.platform === 'instagram-facebook') &&
                                    draft.contentType !== 'instagram_story' && (
                                      <>
                                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center sm:gap-3">
                                          <span className="text-[13px] font-medium">Collaborators</span>
                                          <div className="space-y-1.5">
                                            <div className="flex items-center gap-2">
                                              <div className="relative min-w-0 flex-1">
                                                <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40">
                                                  @
                                                </span>
                                                <input
                                                  value={draft.collaboratorInput}
                                                  onChange={(e) =>
                                                    patchDraft(ch.id, {
                                                      collaboratorInput: e.target.value,
                                                    })
                                                  }
                                                  placeholder="Enter an Instagram username"
                                                  className="h-8 w-full rounded-md border border-white/15 bg-[#141416] py-1 pl-7 pr-2 text-sm outline-none placeholder:text-white/35"
                                                />
                                              </div>
                                              <button
                                                type="button"
                                                aria-label="Add collaborator"
                                                onClick={() => {
                                                  const name = draft.collaboratorInput
                                                    .trim()
                                                    .replace(/^@/, '')
                                                  if (!name || collaborators.length >= 3) return
                                                  if (collaborators.includes(name)) return
                                                  patchDraft(ch.id, {
                                                    collaboratorInput: '',
                                                    meta: {
                                                      ...draft.meta,
                                                      collaborators: [...collaborators, name],
                                                    },
                                                  })
                                                }}
                                                className="flex size-8 items-center justify-center rounded-lg border border-white/15 hover:bg-white/5"
                                              >
                                                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                                  <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M8 7a4 4 0 108 0 4 4 0 00-8 0M16 19h6M19 16v6M6 21v-2a4 4 0 014-4h4"
                                                  />
                                                </svg>
                                              </button>
                                            </div>
                                            {collaborators.length > 0 && (
                                              <div className="flex flex-wrap gap-1.5">
                                                {collaborators.map((name) => (
                                                  <button
                                                    key={name}
                                                    type="button"
                                                    onClick={() =>
                                                      patchDraft(ch.id, {
                                                        meta: {
                                                          ...draft.meta,
                                                          collaborators: collaborators.filter(
                                                            (n) => n !== name
                                                          ),
                                                        },
                                                      })
                                                    }
                                                    className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/80 hover:bg-white/15"
                                                  >
                                                    @{name} ×
                                                  </button>
                                                ))}
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center sm:gap-3">
                                          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
                                            AI-generated
                                          </span>
                                          <button
                                            type="button"
                                            role="switch"
                                            aria-checked={Boolean(draft.meta.is_ai_generated)}
                                            onClick={() =>
                                              patchDraft(ch.id, {
                                                meta: {
                                                  ...draft.meta,
                                                  is_ai_generated: !draft.meta.is_ai_generated,
                                                },
                                              })
                                            }
                                            className={`relative inline-flex h-6 w-[43px] shrink-0 items-center rounded-full p-[3px] transition ${
                                              draft.meta.is_ai_generated
                                                ? 'bg-[#7c5cff]'
                                                : 'bg-white/20'
                                            }`}
                                          >
                                            <span
                                              className={`block h-[18px] w-[18px] rounded-full bg-white transition ${
                                                draft.meta.is_ai_generated
                                                  ? 'translate-x-[19px]'
                                                  : 'translate-x-0'
                                              }`}
                                            />
                                          </button>
                                        </div>
                                      </>
                                    )}

                                  {ch.platform === 'youtube' && (
                                    <>
                                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center sm:gap-3">
                                        <span className="text-[13px] font-medium">Title</span>
                                        <input
                                          value={String(draft.meta.title ?? '')}
                                          onChange={(e) =>
                                            patchDraft(ch.id, {
                                              meta: { ...draft.meta, title: e.target.value },
                                            })
                                          }
                                          placeholder="YouTube title (or first line of caption)"
                                          maxLength={100}
                                          className="h-8 w-full rounded-md border border-white/15 bg-[#141416] px-2 text-sm outline-none placeholder:text-white/35"
                                        />
                                      </div>
                                      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[130px_minmax(0,1fr)] sm:items-center sm:gap-3">
                                        <span className="text-[13px] font-medium">Visibility</span>
                                        <select
                                          value={String(draft.meta.privacy_status ?? 'public')}
                                          onChange={(e) =>
                                            patchDraft(ch.id, {
                                              meta: {
                                                ...draft.meta,
                                                privacy_status: e.target.value,
                                              },
                                            })
                                          }
                                          className="h-8 w-full rounded-md border border-white/15 bg-[#141416] px-2 text-sm outline-none"
                                        >
                                          <option value="public">Public</option>
                                          <option value="unlisted">Unlisted</option>
                                          <option value="private">Private</option>
                                        </select>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}

                              {activeIssues
                                .filter((i) => i.severity === 'error')
                                .map((issue) => (
                                  <p
                                    key={issue.message}
                                    className="rounded-md bg-rose-500/15 px-3 py-1.5 text-sm text-rose-200"
                                  >
                                    {issue.message}
                                  </p>
                                ))}
                            </div>
                          </div>
                        )
                      })}

                      {error && (
                        <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Preview panel */}
              {(showPreview || (step === 'customize' && viewMode === 'preview')) && (
                <aside
                  className={`min-h-0 flex-col bg-[#101012] ${
                    step === 'customize' && viewMode === 'preview'
                      ? 'flex'
                      : 'hidden lg:flex'
                  }`}
                >
                  <h3 className="flex shrink-0 items-center gap-2 px-4 pt-5 pb-4 text-base font-medium sm:px-8">
                    {step === 'customize' && activeChannel
                      ? `${platformLabel(activeChannel.platform)} preview`
                      : 'Post previews'}
                  </h3>
                  <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 pb-8 sm:px-8">
                    {step === 'shared' ? (
                      !sharedContent.trim() && !sharedMedia.length ? (
                        <PreviewEmpty />
                      ) : (
                        selectedChannels.map((ch) => (
                          <PreviewCard
                            key={ch.id}
                            channel={ch}
                            content={sharedContent}
                            media={sharedMedia}
                          />
                        ))
                      )
                    ) : activeChannel ? (
                      !activeContent.trim() && !activeMedia.length ? (
                        <PreviewEmpty />
                      ) : (
                        <PreviewCard
                          channel={activeChannel}
                          content={activeTypeRule?.captionless ? '' : activeContent}
                          media={activeMedia}
                        />
                      )
                    ) : (
                      <PreviewEmpty />
                    )}
                  </div>
                </aside>
              )}
            </div>

            {/* Footer */}
            <footer className="flex shrink-0 flex-col gap-2 border-t border-white/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-8">
              <div className="flex flex-1 flex-wrap items-center gap-x-3.5 gap-y-1">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={createAnother}
                    onChange={(e) => setCreateAnother(e.target.checked)}
                    className="size-4 rounded border-white/20 bg-transparent"
                  />
                  Create another
                </label>
                <button
                  type="button"
                  disabled={saving || uploading}
                  onClick={() => void submit('draft')}
                  className="h-10 rounded-lg px-3 text-sm font-medium text-white/70 hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  Save drafts
                </button>
              </div>

              <div className="relative flex items-center max-sm:w-full" ref={scheduleRef}>
                <button
                  type="button"
                  onClick={() => setScheduleOpen((v) => !v)}
                  className="inline-flex h-10 items-center gap-2 rounded-l-xl rounded-r-none border border-white/15 border-r-0 bg-transparent px-3 text-sm text-white hover:bg-white/5"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 21H6a2 2 0 01-2-2V7a2 2 0 012-2h12a2 2 0 012 2v3M16 3v4M8 3v4M4 11h10M14 18a4 4 0 108 0 4 4 0 00-8 0M18 16.5V18l.5.5"
                    />
                  </svg>
                  {PUBLISH_OPTIONS.find((o) => o.value === publishMode)?.label ?? 'Next available'}
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 15l6-6 6 6" />
                  </svg>
                </button>
                <button
                  type="button"
                  disabled={
                    saving ||
                    uploading ||
                    (step === 'customize' || selectedChannels.length === 1
                      ? publishMode !== 'draft' && !canSubmitPublish
                      : false)
                  }
                  onClick={() => {
                    if (step === 'shared' && selectedChannels.length > 1) {
                      enterCustomize()
                      return
                    }
                    void submit()
                  }}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-l-none rounded-r-xl bg-[#7c5cff] px-4 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:cursor-not-allowed disabled:bg-white/15 disabled:text-white/40 sm:flex-none"
                >
                  {primaryLabel}
                </button>

                <AnimatePresence>
                  {scheduleOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 4 }}
                      className="absolute bottom-[calc(100%+8px)] right-0 z-40 w-56 overflow-hidden rounded-xl border border-white/10 bg-[#1c1c1f] shadow-2xl"
                    >
                      {PUBLISH_OPTIONS.map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => {
                            setPublishMode(opt.value)
                            setScheduleOpen(false)
                          }}
                          className={`flex w-full items-center px-3 py-2.5 text-left text-sm hover:bg-white/5 ${
                            publishMode === opt.value ? 'text-[#c4b5fd]' : 'text-white/80'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      {publishMode === 'scheduled' && (
                        <div className="border-t border-white/10 p-2">
                          <input
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                            className="w-full rounded-lg border border-white/10 bg-[#141416] px-2 py-1.5 text-xs text-white"
                          />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </footer>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp,video/mp4,video/quicktime,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                if (!e.target.files?.length) return
                const target = e.target.getAttribute('data-target') || 'shared'
                void uploadFiles(e.target.files, target)
                e.target.removeAttribute('data-target')
              }}
            />

            <SocialMediaLibraryPicker
              open={libraryOpen}
              onClose={() => setLibraryOpen(false)}
              onSelect={attachLibraryAssets}
              selectedUrls={librarySelectedUrls}
              multiple
            />

            <SocialTelegramMediaPicker
              open={telegramOpen}
              onClose={() => setTelegramOpen(false)}
              onImported={attachLibraryAssets}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
