'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

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
  const channels = Array.isArray(channelsProp) ? channelsProp : []

  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [rangeMode, setRangeMode] = useState<RangeMode>('week')
  const [cursor, setCursor] = useState(() => new Date())
  const [channelFilter, setChannelFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [composerOpen, setComposerOpen] = useState(false)
  const [composerDateKey, setComposerDateKey] = useState<string | null>(null)
  const [detailsEvent, setDetailsEvent] = useState<SocialCalendarEvent | null>(null)
  const [channelsCollapsed, setChannelsCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
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

  const visibleDays = useMemo(() => {
    if (rangeMode === 'day') {
      return [new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate())]
    }
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  }, [rangeMode, cursor, weekStart])

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
    rangeMode === 'day'
      ? cursor.toLocaleDateString(undefined, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : formatWeekRangeLabel(weekStart)

  return (
    <div className="flex h-full min-h-0 overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f12] text-white shadow-xl">
      <SocialChannelsPanel
        channels={channels}
        events={events}
        syncing={syncingChannels}
        collapsed={channelsCollapsed}
        onToggleCollapsed={() => setChannelsCollapsed((v) => !v)}
        onSyncChannels={onSyncChannels}
        selectedChannelId={channelFilter === 'all' ? 'all' : channelFilter}
        onSelectChannel={(id) => setChannelFilter(id)}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <div className="flex items-center gap-2 text-sm font-medium text-white/90">
          <svg className="h-4 w-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          {channelFilter === 'all'
            ? 'All channels'
            : channelOptions.find((c) => c.id === channelFilter)?.label || 'Channels'}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white/5 p-0.5 ring-1 ring-white/10">
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
          <button
            type="button"
            onClick={() => openComposer()}
            className="rounded-lg border border-white/20 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            + New Post
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-white/10 px-4 py-2">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setCursor((d) => addDays(d, rangeMode === 'day' ? -1 : -7))}
            className="rounded-md border border-white/10 px-2 py-1 text-sm text-white/70 hover:bg-white/5"
            aria-label="Previous"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setCursor((d) => addDays(d, rangeMode === 'day' ? 1 : 7))}
            className="rounded-md border border-white/10 px-2 py-1 text-sm text-white/70 hover:bg-white/5"
            aria-label="Next"
          >
            ›
          </button>
          <p className="min-w-[9.5rem] px-1 text-sm font-medium text-white/90">{rangeLabel}</p>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-white/70 hover:bg-white/5"
          >
            Today
          </button>
        </div>

        <select
          value={rangeMode}
          onChange={(e) => setRangeMode(e.target.value as RangeMode)}
          className="rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1 text-xs text-white/80"
        >
          <option value="week">Week</option>
          <option value="day">Day</option>
        </select>

        <select
          value={channelFilter}
          onChange={(e) => setChannelFilter(e.target.value)}
          className="rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1 text-xs text-white/80"
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
          className="rounded-md border border-white/10 bg-[#1a1a1e] px-2 py-1 text-xs text-white/80"
        >
          <option value="all">All posts</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="pending_approval">Pending approval</option>
          <option value="failed">Failed</option>
          <option value="draft">Draft</option>
        </select>

        <span className="rounded-md border border-white/10 px-2 py-1 text-xs text-white/55">
          {timeZone}
        </span>

        <div className="ml-auto flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              disabled={loading}
              onClick={onRefresh}
              className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          )}
          <button
            type="button"
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs text-white/55"
            title="Drafts without a schedule"
          >
            No Date{undated.length ? ` (${undated.length})` : ''}
          </button>
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
          {/* Day headers */}
          <div
            className="grid shrink-0 border-b border-white/10"
            style={{ gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))` }}
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

          {/* Time grid — only this area scrolls */}
          <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
            <div
              className="grid"
              style={{
                gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                minHeight: HOURS.length * HOUR_HEIGHT,
              }}
            >
              {/* Hours column */}
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
      </div>
    </div>
  )
}
