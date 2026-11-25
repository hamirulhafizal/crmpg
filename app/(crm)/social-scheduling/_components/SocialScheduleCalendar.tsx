'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { adminFetch } from '@/app/lib/admin-api-client'
import type { SocialCalendarEvent, TryPostSocialAccount } from '@/app/lib/trypost/types'
import {
  addDays,
  formatTimeInZone,
  formatWeekRangeLabel,
  localDateKey,
  partsInTimeZone,
  platformLabel,
  platformShort,
  platformVisual,
  startOfWeekMonday,
} from '@/app/lib/trypost/calendar-shared'
import { SocialChannelsPanel } from '@/app/(crm)/social-scheduling/_components/SocialChannelsPanel'
import { SocialCreatePostModal } from '@/app/(crm)/social-scheduling/_components/SocialCreatePostModal'
import { SocialGenerateWeekModal } from '@/app/(crm)/social-scheduling/_components/SocialGenerateWeekModal'
import { SocialPostDetailsModal } from '@/app/(crm)/social-scheduling/_components/SocialPostDetailsModal'
import type { TryPostPublishMode } from '@/app/lib/trypost/types'

const HOUR_HEIGHT = 56
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type ViewMode = 'calendar' | 'list'
type RangeMode = 'week' | 'day'

type Props = {
  events: SocialCalendarEvent[]
  channels: TryPostSocialAccount[]
  timeZone?: string
  loading?: boolean
  saving?: boolean
  syncingChannels?: boolean
  onRefresh?: () => void
  onSyncChannels: () => Promise<void>
  onCreatePost: (input: {
    content: string
    socialAccountIds: string[]
    publishMode: TryPostPublishMode
    scheduledAt: string | null
    mediaUrls: string[]
    createAnother: boolean
    destinations: Array<{
      socialAccountId: string
      content?: string | null
      contentType?: string | null
      mediaUrls?: string[]
      meta?: Record<string, unknown>
    }>
  }) => Promise<void>
}

function PlatformIcon({ platform }: { platform: string }) {
  const visual = platformVisual(platform)
  return (
    <span
      className={`flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-bold text-white ${visual.badgeClassName}`}
      title={visual.label}
    >
      {platformShort(platform)}
    </span>
  )
}

function StatusMark({ kind }: { kind: SocialCalendarEvent['kind'] }) {
  if (kind === 'published') {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[8px] text-white">
        ✓
      </span>
    )
  }
  if (kind === 'failed') {
    return (
      <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] text-white">
        !
      </span>
    )
  }
  if (kind === 'scheduled' || kind === 'pending_approval') {
    return <span className="h-2 w-2 rounded-full bg-amber-400" />
  }
  return <span className="h-2 w-2 rounded-full bg-white/30" />
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12 AM'
  if (hour < 12) return `${hour} AM`
  if (hour === 12) return '12 PM'
  return `${hour - 12} PM`
}

/** TryPost-style chip thumbnail: video frame via #t=0.1 + play badge. */
function CalendarPostThumbnail({
  url,
  kind,
  testId,
  sizeClassName = 'h-5 w-5',
}: {
  url: string
  kind: 'image' | 'video' | null
  testId?: string
  sizeClassName?: string
}) {
  const isVideo =
    kind === 'video' || /\.(mp4|mov|webm|m4v)(\?|#|$)/i.test(url)

  if (isVideo) {
    const videoSrc = url.includes('#') ? url : `${url}#t=0.1`
    return (
      <span
        className={`relative shrink-0 overflow-hidden rounded bg-white/10 ${sizeClassName}`}
        data-testid={testId}
      >
        <video
          src={videoSrc}
          className="h-full w-full object-cover"
          playsInline
          muted
          preload="metadata"
        />
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden
          className="absolute left-1/2 top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/60 p-0.5 text-white"
        >
          <path d="M6 4v16a1 1 0 0 0 1.524.852l13-8a1 1 0 0 0 0-1.704l-13-8A1 1 0 0 0 6 4z" />
        </svg>
      </span>
    )
  }

  return (
    <span
      className={`relative shrink-0 overflow-hidden rounded bg-white/10 ${sizeClassName}`}
      data-testid={testId}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="h-full w-full object-cover" />
    </span>
  )
}

export function SocialScheduleCalendar({
  events: eventsProp,
  channels: channelsProp,
  timeZone = 'UTC',
  loading = false,
  saving = false,
  syncingChannels = false,
  onRefresh,
  onSyncChannels,
  onCreatePost,
}: Props) {
  const events = Array.isArray(eventsProp) ? eventsProp : []
  const channels = useMemo(() => {
    const base = Array.isArray(channelsProp) ? channelsProp : []
    const avatarById = new Map<string, string>()
    for (const event of events) {
      if (event.channelId && event.channelAvatarUrl && !avatarById.has(event.channelId)) {
        avatarById.set(event.channelId, event.channelAvatarUrl)
      }
    }
    if (!avatarById.size) return base
    return base.map((ch) =>
      ch.avatar_url
        ? ch
        : { ...ch, avatar_url: avatarById.get(ch.id) ?? ch.avatar_url ?? null }
    )
  }, [channelsProp, events])

  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerDateKey, setComposerDateKey] = useState<string | null>(null)
  const [detailsEvent, setDetailsEvent] = useState<SocialCalendarEvent | null>(null)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generateRunning, setGenerateRunning] = useState(false)
  const [generateProgressLabel, setGenerateProgressLabel] = useState<string | null>(null)

  // Keep background generation status alive even when the modal is closed.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const res = await adminFetch('/api/social-scheduling/generate')
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok) return
        const batch = data.batch as
          | {
              status?: string
              progress?: { label?: string; current?: number; total?: number }
            }
          | null
        const running = batch?.status === 'generating'
        setGenerateRunning(Boolean(running))
        setGenerateProgressLabel(
          running
            ? batch?.progress?.label ||
                `${batch?.progress?.current ?? 0}/${batch?.progress?.total ?? 7}`
            : null
        )
      } catch {
        // ignore
      }
    }
    void tick()
    const id = setInterval(() => void tick(), generateRunning || generateOpen ? 2500 : 15000)
    return () => {
      cancelled = true
      clearInterval(id)
    }
  }, [generateRunning, generateOpen])
  const [channelsCollapsed, setChannelsCollapsed] = useState(true)
  const [isMobile, setIsMobile] = useState(false)
  const [mounted, setMounted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = () => {
      const mobile = mq.matches
      setIsMobile(mobile)
      if (mobile) {
        setChannelsCollapsed(true)
        setRangeMode((prev) => (prev === 'week' ? 'day' : prev))
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  // Avoid SSR/client date mismatch for "today" highlight and week cursor.
  const todayKey = mounted ? localDateKey(new Date().toISOString(), timeZone) : ''
  const weekStart = useMemo(() => startOfWeekMonday(cursor), [cursor])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Start near early morning like TryPost week view.
    el.scrollTop = Math.max(0, 2 * HOUR_HEIGHT - 8)
  }, [viewMode, rangeMode, weekStart])

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (channelFilter !== 'all' && e.channelId !== channelFilter) return false
      if (statusFilter !== 'all' && e.kind !== statusFilter) return false
      return true
    })
  }, [events, channelFilter, statusFilter])

  const effectiveRangeMode: RangeMode = isMobile ? 'day' : rangeMode

  const visibleDays = useMemo(() => {
    if (effectiveRangeMode === 'day') {
      return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]
    }
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [effectiveRangeMode, cursor, weekStart])

  const dayKeys = useMemo(
    () =>
      visibleDays.map((d) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${day}`
      }),
    [visibleDays]
  )

  const eventsByDay = useMemo(() => {
    const map = new Map<string, SocialCalendarEvent[]>()
    for (const key of dayKeys) map.set(key, [])
    for (const event of filtered) {
      const key = localDateKey(event.at, timeZone)
      if (!map.has(key)) continue
      map.get(key)!.push(event)
    }
    for (const list of map.values()) {
      list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    }
    return map
  }, [filtered, dayKeys, timeZone])

  const undated = useMemo(
    () => filtered.filter((e) => e.kind === 'draft' && !e.at),
    [filtered]
  )

  const channelOptions = useMemo(() => {
    return channels
      .filter((c) => c.status === 'connected')
      .map((c) => ({
        id: c.id,
        label: `${platformLabel(c.platform)} @${c.username || c.display_name || 'channel'}`,
      }))
  }, [channels])

  const openComposer = (dateKey?: string) => {
    setComposerDateKey(dateKey ?? null)
    setComposerOpen(true)
  }

  const goToday = () => setCursor(new Date())

  const rangeLabel =
    effectiveRangeMode === 'day'
      ? cursor.toLocaleDateString(undefined, {
          weekday: isMobile ? 'short' : 'long',
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : formatWeekRangeLabel(weekStart)

  const selectedDayKey = useMemo(() => {
    const y = cursor.getFullYear()
    const m = String(cursor.getMonth() + 1).padStart(2, '0')
    const day = String(cursor.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [cursor])

  const selectedDayEvents = eventsByDay.get(selectedDayKey) ?? []

  const weekStripDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  )

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12] text-white shadow-xl">
      {!channelsCollapsed && (
        <button
          type="button"
          className="absolute inset-0 z-20 bg-black/50 md:hidden"
          aria-label="Close channels"
          onClick={() => setChannelsCollapsed(true)}
        />
      )}
      <SocialChannelsPanel
        channels={channels}
        events={events}
        syncing={syncingChannels}
        collapsed={channelsCollapsed}
        onToggleCollapsed={() => setChannelsCollapsed((v) => !v)}
        onSyncChannels={onSyncChannels}
        selectedChannelId={channelFilter === 'all' ? 'all' : channelFilter}
        onSelectChannel={(id) => {
          setChannelFilter(id)
          if (isMobile) setChannelsCollapsed(true)
        }}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3 sm:px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setChannelsCollapsed((v) => !v)}
            className="inline-flex size-9 items-center justify-center rounded-lg border border-white/10 text-white/70 hover:bg-white/5 md:hidden"
            aria-label="Channels"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-sm font-medium text-white/90">
            <span className="truncate">
              {channelFilter === 'all'
                ? 'All channels'
                : channelOptions.find((c) => c.id === channelFilter)?.label || 'Channels'}
            </span>
          </div>
          <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10 sm:hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                viewMode === 'list' ? 'bg-[#7c5cff] text-white' : 'text-white/60'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold ${
                viewMode === 'calendar' ? 'bg-[#7c5cff] text-white' : 'text-white/60'
              }`}
            >
              Cal
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <div className="hidden rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10 sm:flex">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'list' ? 'bg-[#7c5cff] text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === 'calendar' ? 'bg-[#7c5cff] text-white' : 'text-white/60 hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>
          {generateRunning && (
            <button
              type="button"
              onClick={() => setGenerateOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-400/15 sm:text-sm"
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-300 opacity-60" />
                <span className="relative inline-flex size-2 rounded-full bg-amber-300" />
              </span>
              <span className="max-sm:hidden">{generateProgressLabel || 'Generating…'}</span>
              <span className="sm:hidden">Gen…</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setGenerateOpen(true)}
            className="rounded-lg border border-[#7c5cff]/40 bg-[#7c5cff]/15 px-2.5 py-1.5 text-xs font-semibold text-[#d4c8ff] hover:bg-[#7c5cff]/25 sm:px-3 sm:text-sm"
          >
            <span className="sm:hidden">Generate</span>
            <span className="max-sm:hidden">Generate 7 days</span>
          </button>
          <button
            type="button"
            onClick={() => openComposer()}
            className="rounded-lg bg-[#7c5cff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#6d4ff0] sm:text-sm"
          >
            + New Post
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-col gap-2 border-b border-white/10 px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:px-4">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCursor((d) => addDays(d, effectiveRangeMode === 'day' ? -1 : -7))}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/5"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor((d) => addDays(d, effectiveRangeMode === 'day' ? 1 : 7))}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-sm text-white/70 hover:bg-white/5"
            aria-label="Next"
          >
            ›
          </button>
          <p className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-white/90 sm:min-w-[9.5rem] sm:flex-none">
            {rangeLabel}
          </p>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/70 hover:bg-white/5"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={isMobile ? 'day' : rangeMode}
            onChange={(e) => setRangeMode(e.target.value as RangeMode)}
            className="rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1.5 text-xs text-white/80 max-sm:hidden"
          >
            <option value="week">Week</option>
            <option value="day">Day</option>
          </select>

          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="max-w-[46%] flex-1 rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1.5 text-xs text-white/80 sm:max-w-none sm:flex-none"
          >
            <option value="all">Channels</option>
            {channelOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="max-w-[46%] flex-1 rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1.5 text-xs text-white/80 sm:max-w-none sm:flex-none"
          >
            <option value="all">All posts</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
            <option value="pending_approval">Pending approval</option>
            <option value="failed">Failed</option>
            <option value="draft">Draft</option>
          </select>

          <span className="hidden rounded-md border border-white/10 px-2 py-1.5 text-xs text-white/55 sm:inline">
            {timeZone}
          </span>

          <div className="ml-auto flex items-center gap-2">
            {onRefresh && (
              <button
                type="button"
                disabled={loading}
                onClick={onRefresh}
                className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
              >
                {loading ? '…' : 'Refresh'}
              </button>
            )}
            <button
              type="button"
              className="hidden rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-white/55 sm:inline"
              title="Drafts without a schedule"
            >
              No Date{undated.length ? ` (${undated.length})` : ''}
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-white/40">No posts in this filter.</p>
          ) : (
            <ul className="space-y-2">
              {[...filtered]
                .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
                .map((event) => (
                  <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => setDetailsEvent(event)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-[#1a1a1e] px-3 py-2.5 text-left transition hover:border-white/20 hover:bg-[#202024]"
                  >
                    <PlatformIcon platform={event.platform} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/90">
                        {event.content?.trim() || '(media only)'}
                      </p>
                      <p className="mt-0.5 text-xs text-white/45">
                        {platformLabel(event.platform)} · @{event.channelUsername || 'channel'} ·{' '}
                        {formatTimeInZone(event.at, timeZone)} · {event.status}
                      </p>
                    </div>
                    {event.mediaThumbUrl && (
                      <CalendarPostThumbnail
                        url={event.mediaThumbUrl}
                        kind={event.mediaThumbKind}
                        testId={
                          event.trypostPostId
                            ? `calendar-post-thumbnail-${event.trypostPostId}`
                            : undefined
                        }
                        sizeClassName="h-10 w-10"
                      />
                    )}
                    <StatusMark kind={event.kind} />
                  </button>
                  </li>
                ))}
            </ul>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Mobile week strip — pick a day */}
          <div className="shrink-0 border-b border-white/10 px-2 py-2 md:hidden">
            <div className="flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {weekStripDays.map((date) => {
                const y = date.getFullYear()
                const m = String(date.getMonth() + 1).padStart(2, '0')
                const d = String(date.getDate()).padStart(2, '0')
                const key = `${y}-${m}-${d}`
                const isToday = key === todayKey
                const isSelected = key === selectedDayKey
                const mondayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1
                const count = (eventsByDay.get(key) ?? []).length
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setCursor(new Date(date.getFullYear(), date.getMonth(), date.getDate()))}
                    className={`flex min-w-[3rem] flex-1 flex-col items-center rounded-xl px-1.5 py-2 transition ${
                      isSelected
                        ? 'bg-[#7c5cff] text-white'
                        : isToday
                          ? 'bg-[#7c5cff]/15 text-[#d4c8ff]'
                          : 'bg-white/[0.03] text-white/70'
                    }`}
                  >
                    <span className="text-[10px] font-medium uppercase opacity-80">
                      {DAY_NAMES[mondayIndex]!.slice(0, 3)}
                    </span>
                    <span className="mt-0.5 text-base font-semibold tabular-nums">{date.getDate()}</span>
                    {count > 0 && (
                      <span
                        className={`mt-1 h-1 w-1 rounded-full ${
                          isSelected ? 'bg-white' : 'bg-[#a78bfa]'
                        }`}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Mobile agenda for selected day */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:hidden [-webkit-overflow-scrolling:touch]">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-white/80">
                {selectedDayEvents.length
                  ? `${selectedDayEvents.length} post${selectedDayEvents.length === 1 ? '' : 's'}`
                  : 'No posts this day'}
              </p>
              <button
                type="button"
                onClick={() => openComposer(selectedDayKey)}
                className="rounded-lg border border-dashed border-white/20 px-2.5 py-1.5 text-xs font-medium text-white/60 hover:border-[#7c5cff]/40 hover:text-white"
              >
                + Schedule
              </button>
            </div>
            {selectedDayEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center">
                <p className="text-sm text-white/45">Nothing scheduled.</p>
                <button
                  type="button"
                  onClick={() => openComposer(selectedDayKey)}
                  className="mt-3 rounded-lg bg-[#7c5cff] px-3 py-2 text-xs font-semibold text-white"
                >
                  Create a post
                </button>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {selectedDayEvents.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => setDetailsEvent(event)}
                      className="flex w-full gap-3 rounded-2xl border border-white/10 bg-[#1a1a1e] p-3 text-left transition active:scale-[0.99] hover:border-white/20"
                    >
                      {event.mediaThumbUrl ? (
                        <CalendarPostThumbnail
                          url={event.mediaThumbUrl}
                          kind={event.mediaThumbKind}
                          sizeClassName="h-14 w-14 rounded-xl"
                          testId={
                            event.trypostPostId
                              ? `calendar-post-thumbnail-${event.trypostPostId}`
                              : undefined
                          }
                        />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/5">
                          <PlatformIcon platform={event.platform} />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold tabular-nums text-white">
                            {formatTimeInZone(event.at, timeZone)}
                          </span>
                          <PlatformIcon platform={event.platform} />
                          <StatusMark kind={event.kind} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm leading-snug text-white/75">
                          {event.content?.trim() || '(media only)'}
                        </p>
                        <p className="mt-1 truncate text-[11px] text-white/40">
                          @{event.channelUsername || 'channel'} · {event.status}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Desktop week/day grid */}
          <div className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex">
            <div
              className="grid shrink-0 border-b border-white/10"
              style={{
                gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(${
                  visibleDays.length === 1 ? '0' : '120'
                }px, 1fr))`,
              }}
            >
              <div className="border-r border-white/10" />
              {visibleDays.map((date, idx) => {
                const key = dayKeys[idx]
                const isToday = key === todayKey
                const mondayIndex = date.getDay() === 0 ? 6 : date.getDay() - 1
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => openComposer(key)}
                    className={`border-r border-white/10 px-2 py-3 text-left last:border-r-0 ${
                      isToday ? 'bg-[#7c5cff]/10' : 'hover:bg-white/[0.03]'
                    }`}
                  >
                    <p className={`text-xs ${isToday ? 'font-semibold text-[#b7a6ff]' : 'text-white/50'}`}>
                      {DAY_NAMES[mondayIndex]}
                    </p>
                    <p
                      className={`mt-0.5 text-lg font-semibold tabular-nums ${
                        isToday ? 'text-white' : 'text-white/85'
                      }`}
                    >
                      {date.getDate()}
                      {isToday && (
                        <span className="ml-2 inline-block h-0.5 w-6 rounded bg-[#7c5cff] align-middle" />
                      )}
                    </p>
                  </button>
                )
              })}
            </div>

            <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(${
                    visibleDays.length === 1 ? '0' : '120'
                  }px, 1fr))`,
                  minHeight: HOURS.length * HOUR_HEIGHT,
                }}
              >
                <div className="relative border-r border-white/10">
                  {HOURS.map((hour) => (
                    <div
                      key={hour}
                      className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-white/35"
                      style={{ top: hour * HOUR_HEIGHT }}
                    >
                      {hourLabel(hour)}
                    </div>
                  ))}
                </div>

                {dayKeys.map((key) => {
                  const isToday = key === todayKey
                  const dayEvents = eventsByDay.get(key) ?? []
                  return (
                    <div
                      key={key}
                      className={`relative border-r border-white/10 last:border-r-0 ${
                        isToday ? 'bg-[#7c5cff]/[0.06]' : ''
                      }`}
                      style={{ height: HOURS.length * HOUR_HEIGHT }}
                      onDoubleClick={() => openComposer(key)}
                    >
                      {HOURS.map((hour) => (
                        <div
                          key={hour}
                          className="absolute inset-x-0 border-t border-white/[0.06]"
                          style={{ top: hour * HOUR_HEIGHT, height: HOUR_HEIGHT }}
                        />
                      ))}

                      {dayEvents.map((event) => {
                        const parts = partsInTimeZone(event.at, timeZone)
                        const top = (parts.hour + parts.minute / 60) * HOUR_HEIGHT
                        return (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setDetailsEvent(event)
                            }}
                            className="absolute left-1 right-1 z-10 overflow-hidden rounded-lg border border-white/10 bg-[#1c1c20] px-1.5 py-1 text-left shadow-lg shadow-black/30 transition hover:border-[#7c5cff]/50 hover:bg-[#24242a]"
                            style={{ top: Math.max(2, top), minHeight: 28 }}
                            title={event.content || undefined}
                          >
                            <div className="flex items-center gap-1.5">
                              <PlatformIcon platform={event.platform} />
                              <span className="truncate text-[11px] font-medium tabular-nums text-white/90">
                                {formatTimeInZone(event.at, timeZone)}
                              </span>
                              <StatusMark kind={event.kind} />
                              <span className="ml-auto truncate text-[10px] text-white/40">
                                @{event.channelUsername || 'ch'}
                              </span>
                              {event.mediaThumbUrl && (
                                <CalendarPostThumbnail
                                  url={event.mediaThumbUrl}
                                  kind={event.mediaThumbKind}
                                  testId={
                                    event.trypostPostId
                                      ? `calendar-post-thumbnail-${event.trypostPostId}`
                                      : undefined
                                  }
                                  sizeClassName="h-5 w-5"
                                />
                              )}
                            </div>
                            {event.content?.trim() && (
                              <p className="mt-0.5 line-clamp-1 text-[10px] text-white/45">
                                {event.content}
                              </p>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <SocialCreatePostModal
        open={composerOpen}
        channels={channels}
        saving={saving}
        initialDateKey={composerDateKey}
        onClose={() => setComposerOpen(false)}
        onSubmit={async (input) => {
          await onCreatePost(input)
          if (!input.createAnother) setComposerOpen(false)
        }}
      />

      <SocialPostDetailsModal
        open={Boolean(detailsEvent)}
        event={detailsEvent}
        timeZone={timeZone}
        onClose={() => setDetailsEvent(null)}
      />

      <SocialGenerateWeekModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onApproved={() => {
          void onRefresh?.()
        }}
        onStatusChange={(batch) => {
          const running = batch?.status === 'generating'
          setGenerateRunning(Boolean(running))
          setGenerateProgressLabel(
            running
              ? batch?.progress?.label ||
                  `${batch?.progress?.current ?? 0}/${batch?.progress?.total ?? 7}`
              : null
          )
        }}
      />
      </div>
    </div>
  )
}
