'use client'

import { useMemo, useState } from 'react'

import type { SocialCalendarEvent, TryPostSocialAccount } from '@/app/lib/trypost/types'
import { platformLabel, platformShort, platformVisual } from '@/app/lib/trypost/calendar-shared'
import { SocialConnectChannelModal } from '@/app/(crm)/social-scheduling/_components/SocialConnectChannelModal'

type Props = {
  channels: TryPostSocialAccount[]
  events?: SocialCalendarEvent[]
  syncing?: boolean
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onSyncChannels: () => Promise<void>
  onSelectChannel?: (channelId: string | 'all') => void
  selectedChannelId?: string | 'all'
}

function channelTitle(ch: TryPostSocialAccount): string {
  return ch.display_name || (ch.username ? `@${ch.username}` : 'Channel')
}

function channelInitials(ch: TryPostSocialAccount): string {
  const raw = (ch.display_name || ch.username || '?').trim()
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase()
  return raw.slice(0, 2).toUpperCase()
}

function ChannelAvatar({ channel }: { channel: TryPostSocialAccount }) {
  const visual = platformVisual(channel.platform)
  return (
    <span className="relative inline-block shrink-0">
      <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-amber-300 to-yellow-500 text-[10px] font-bold text-slate-900">
        {channelInitials(channel)}
      </span>
      <span
        className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full text-[7px] font-bold text-white ring-2 ring-[#141416] ${visual.badgeClassName}`}
        title={visual.label}
      >
        {platformShort(channel.platform)}
      </span>
    </span>
  )
}

export function SocialChannelsPanel({
  channels: channelsProp,
  events = [],
  syncing = false,
  collapsed = false,
  onToggleCollapsed,
  onSyncChannels,
  onSelectChannel,
  selectedChannelId = 'all',
}: Props) {
  const channels = Array.isArray(channelsProp) ? channelsProp : []
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [connectOpen, setConnectOpen] = useState(false)

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const event of events) {
      if (!event.channelId) continue
      map.set(event.channelId, (map.get(event.channelId) ?? 0) + 1)
    }
    return map
  }, [events])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = channels.filter((c) => c.status === 'connected' || c.status === 'token_expired')
    if (!q) return list
    return list.filter((c) => {
      const hay = `${c.display_name ?? ''} ${c.username ?? ''} ${c.platform}`.toLowerCase()
      return hay.includes(q)
    })
  }, [channels, query])

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-white/10 bg-[#121214] py-3">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="rounded-lg p-2 text-white/50 hover:bg-white/5 hover:text-white"
          title="Show channels"
          aria-label="Show channels"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="mt-3 flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-white/70 hover:bg-white/5 hover:text-white"
          title="Connect channel"
        >
          +
        </button>
        <SocialConnectChannelModal
          open={connectOpen}
          syncing={syncing}
          onClose={() => setConnectOpen(false)}
          onSyncAfterConnect={onSyncChannels}
        />
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-white/10 bg-[#121214]">
      <div className="flex shrink-0 items-center gap-1 border-b border-white/10 px-3 py-2.5">
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-white/55">
          Channels · {channels.filter((c) => c.status === 'connected').length}
        </p>
        <button
          type="button"
          onClick={() => setSearchOpen((v) => !v)}
          className={`rounded-md p-1.5 ${searchOpen ? 'bg-white/10 text-white' : 'text-white/45 hover:bg-white/5 hover:text-white'}`}
          title="Search channels"
          aria-label="Search channels"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z"
            />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => void onSyncChannels()}
          disabled={syncing}
          className="rounded-md p-1.5 text-white/45 hover:bg-white/5 hover:text-white disabled:opacity-50"
          title="Sync channels"
          aria-label="Sync channels"
        >
          <svg className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="group flex h-7 w-7 items-center justify-center rounded-lg border border-white/15 text-white/80 hover:border-[#7c5cff]/50 hover:bg-[#7c5cff]/15 hover:text-white"
            aria-label="Connect channel"
          >
            +
            <span className="pointer-events-none absolute -top-8 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-[#2a2a30] px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg ring-1 ring-white/10 transition group-hover:opacity-100">
              Connect channel
            </span>
          </button>
        </div>
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="rounded-md p-1.5 text-white/35 hover:bg-white/5 hover:text-white"
            title="Collapse"
            aria-label="Collapse channels"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
      </div>

      {searchOpen && (
        <div className="border-b border-white/10 px-2.5 py-2">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels…"
            className="w-full rounded-lg border border-white/10 bg-[#0f0f12] px-2.5 py-1.5 text-xs text-white outline-none placeholder:text-white/35 focus:border-[#7c5cff]/40"
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
        <button
          type="button"
          onClick={() => onSelectChannel?.('all')}
          className={`mb-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm transition ${
            selectedChannelId === 'all' ? 'bg-white/[0.07] text-white' : 'text-white/70 hover:bg-white/[0.04]'
          }`}
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[10px] font-bold">
            All
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">All channels</span>
          <span className="text-xs text-white/35">{events.length}</span>
        </button>

        {filtered.length === 0 ? (
          <div className="px-2 py-8 text-center">
            <p className="text-xs text-white/40">No channels yet</p>
            <button
              type="button"
              onClick={() => setConnectOpen(true)}
              className="mt-3 text-xs font-semibold text-[#a78bfa] hover:text-[#c4b5fd]"
            >
              Connect a channel
            </button>
          </div>
        ) : (
          filtered.map((ch) => {
            const active = selectedChannelId === ch.id
            const lost = ch.status === 'token_expired'
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => onSelectChannel?.(ch.id)}
                className={`mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition ${
                  active ? 'bg-white/[0.07]' : 'hover:bg-white/[0.04]'
                }`}
                title={`${channelTitle(ch)} · ${platformLabel(ch.platform)}`}
              >
                <ChannelAvatar channel={ch} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-white">
                    {channelTitle(ch)}
                  </span>
                  <span className="block truncate text-[11px] text-white/40">
                    {platformLabel(ch.platform)}
                    {lost ? ' · Connection lost' : ''}
                  </span>
                </span>
                <span className="text-xs tabular-nums text-white/35">{counts.get(ch.id) ?? 0}</span>
              </button>
            )
          })
        )}
      </div>

      <div className="shrink-0 border-t border-white/10 p-2.5">
        <button
          type="button"
          onClick={() => setConnectOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 px-3 py-2 text-xs font-semibold text-white/70 transition hover:border-[#7c5cff]/40 hover:bg-[#7c5cff]/10 hover:text-white"
        >
          <span className="text-sm">+</span> Connect channel
        </button>
      </div>

      <SocialConnectChannelModal
        open={connectOpen}
        syncing={syncing}
        onClose={() => setConnectOpen(false)}
        onSyncAfterConnect={onSyncChannels}
      />
    </aside>
  )
}
