'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'

import {
  TRYPOST_CONNECTABLE_NETWORKS,
  TRYPOST_CONNECT_CHANNEL_URL,
  type ConnectableNetwork,
} from '@/app/lib/trypost/platforms'

type Props = {
  open: boolean
  syncing?: boolean
  onClose: () => void
  onSyncAfterConnect: () => Promise<void>
}

function NetworkIcon({ network }: { network: ConnectableNetwork }) {
  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white ${network.badgeClassName}`}
    >
      {network.short}
    </span>
  )
}

export function SocialConnectChannelModal({
  open,
  syncing = false,
  onClose,
  onSyncAfterConnect,
}: Props) {
  const [mounted, setMounted] = useState(false)
  const [selected, setSelected] = useState<ConnectableNetwork | null>(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    setSelected(null)
    setQuery('')
    setError(null)
    setBusy(false)
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (selected) setSelected(null)
        else onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, selected])

  const networks = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return TRYPOST_CONNECTABLE_NETWORKS
    return TRYPOST_CONNECTABLE_NETWORKS.filter(
      (n) =>
        n.label.toLowerCase().includes(q) ||
        n.subtitle.toLowerCase().includes(q) ||
        n.id.includes(q)
    )
  }, [query])

  const openTryPost = () => {
    window.open(TRYPOST_CONNECT_CHANNEL_URL, '_blank', 'noopener,noreferrer')
  }

  const finishSync = async () => {
    setBusy(true)
    setError(null)
    try {
      await onSyncAfterConnect()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync channels')
    } finally {
      setBusy(false)
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
            aria-labelledby="connect-channel-title"
            className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#1a1a1e] text-white shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: 'tween', duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          >
            <header className="relative shrink-0 border-b border-white/10 px-5 py-4 text-center">
              <h2 id="connect-channel-title" className="text-base font-semibold">
                {selected ? `Connect ${selected.label}` : 'Connect a new channel'}
              </h2>
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </header>

            {!selected ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="relative mb-4">
                  <svg
                    className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/35"
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
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search networks…"
                    className="w-full rounded-xl border border-white/10 bg-[#121214] py-2.5 pl-9 pr-3 text-sm outline-none placeholder:text-white/35 focus:border-[#7c5cff]/50"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {networks.map((network) => (
                    <button
                      key={network.id}
                      type="button"
                      onClick={() => setSelected(network)}
                      className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#121214] px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
                    >
                      <NetworkIcon network={network} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-white">
                          {network.label}
                        </span>
                        <span className="block truncate text-xs text-white/45">{network.subtitle}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {networks.length === 0 && (
                  <p className="py-10 text-center text-sm text-white/40">No networks match your search.</p>
                )}
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <div className="mx-auto max-w-md text-center">
                  <div className="mx-auto mb-4 flex justify-center">
                    <NetworkIcon network={selected} />
                  </div>
                  <p className="text-sm text-white/65">
                    OAuth for {selected.label} runs in TryPost. Authorize the account there, then come
                    back and sync so CRMpg picks up the new channel.
                  </p>
                  <ol className="mt-4 space-y-2 rounded-xl border border-white/10 bg-[#121214] px-4 py-3 text-left text-sm text-white/70">
                    <li>1. Open TryPost and choose <span className="text-white">{selected.label}</span>.</li>
                    <li>2. Sign in and grant publish permission.</li>
                    <li>3. Finish connection, then sync here.</li>
                  </ol>

                  {error && (
                    <p className="mt-3 rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">{error}</p>
                  )}

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <button
                      type="button"
                      onClick={() => setSelected(null)}
                      className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium text-white/80 hover:bg-white/5"
                    >
                      ← All networks
                    </button>
                    <button
                      type="button"
                      onClick={openTryPost}
                      className={`rounded-xl px-4 py-2.5 text-sm font-semibold text-white ${selected.badgeClassName}`}
                    >
                      Connect {selected.label}
                    </button>
                    <button
                      type="button"
                      disabled={busy || syncing}
                      onClick={() => void finishSync()}
                      className="rounded-xl bg-[#7c5cff] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#6d4fff] disabled:opacity-50"
                    >
                      {busy || syncing ? 'Syncing…' : "I've connected — Sync"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  )
}
