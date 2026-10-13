'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useCustomerEditModal } from '@/app/contexts/customer-edit-modal-context'
import { CustomerWhatsAppAvatar } from '@/app/customers/_components/CustomerWhatsAppAvatar'

export type GlobalSearchCustomer = {
  id: string
  name: string | null
  sender_name: string | null
  save_name: string | null
  email: string | null
  phone: string | null
  pg_code: string | null
  parent_pg_code: string | null
  display_name: string
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z"
      />
    </svg>
  )
}

function ResultSkeleton() {
  return (
    <ul className="divide-y divide-border" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-muted" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3.5 w-40 max-w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-56 max-w-full animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}

function secondaryLine(c: GlobalSearchCustomer): string {
  const parts = [c.pg_code, c.phone, c.email].filter((p) => Boolean(p && String(p).trim()))
  return parts.join(' · ') || 'No contact details'
}

export function GlobalCustomerSearch() {
  const titleId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const { openCustomerById } = useCustomerEditModal()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<GlobalSearchCustomer[]>([])

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return
    const t = window.setTimeout(() => setDebounced(query.trim()), 300)
    return () => window.clearTimeout(t)
  }, [query, open])

  const focusSearchInput = useCallback(() => {
    const el = inputRef.current
    if (!el) return
    // Mobile Safari only reliably opens the keyboard when focus lands on a
    // visible, interactive field (after the sheet has painted).
    el.focus({ preventScroll: true })
    try {
      const len = el.value.length
      el.setSelectionRange(len, len)
    } catch {
      /* some input types reject selection */
    }
  }, [])

  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Retry across paint + sheet animation so iOS/Android keyboards open.
    const t0 = window.requestAnimationFrame(() => focusSearchInput())
    const t1 = window.setTimeout(focusSearchInput, 120)
    const t2 = window.setTimeout(focusSearchInput, 280)
    return () => {
      document.body.style.overflow = previous
      window.cancelAnimationFrame(t0)
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [open, focusSearchInput])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    if (!debounced) {
      setResults([])
      setLoading(false)
      setError(null)
      return
    }

    const ac = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/customers/global-search?q=${encodeURIComponent(debounced)}`,
          { signal: ac.signal, cache: 'no-store' }
        )
        const json = (await res.json()) as {
          data?: GlobalSearchCustomer[]
          error?: string
        }
        if (!res.ok) throw new Error(json.error || 'Search failed')
        if (ac.signal.aborted) return
        setResults(Array.isArray(json.data) ? json.data : [])
      } catch (e) {
        if (ac.signal.aborted) return
        setResults([])
        setError(e instanceof Error ? e.message : 'Search failed')
      } finally {
        if (!ac.signal.aborted) setLoading(false)
      }
    })()

    return () => ac.abort()
  }, [debounced, open])

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setDebounced('')
    setResults([])
    setError(null)
    setLoading(false)
  }, [])

  const openCustomer = useCallback(
    (customer: GlobalSearchCustomer) => {
      openCustomerById(customer.id, {
        tab: 'details',
        initialCustomer: customer as unknown as Record<string, unknown>,
        overlayZIndexClassName: 'z-[2100]',
      })
      close()
    },
    [close, openCustomerById]
  )

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    setDebounced(query.trim())
  }

  const dialog =
    mounted &&
    createPortal(
      <AnimatePresence>
        {open ? (
          <motion.div
            key="global-customer-search"
            className="fixed inset-0 z-[2050] flex items-end justify-center overflow-hidden overscroll-none sm:items-center sm:p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <button
              type="button"
              className="absolute inset-0 bg-black/50 backdrop-blur-[2px] dark:bg-black/70"
              aria-label="Close search"
              onClick={close}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative flex max-h-[min(88vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 16, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onAnimationComplete={() => {
                if (open) focusSearchInput()
              }}
            >
              <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                <div className="min-w-0">
                  <h2 id={titleId} className="text-base font-semibold text-foreground">
                    Search customers
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    PG code, phone, email, or name — includes nested Tree Tier
                  </p>
                </div>
                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Close"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <form onSubmit={onSubmit} className="border-b border-border px-4 py-3 sm:px-5">
                <label className="sr-only" htmlFor="global-customer-search-input">
                  Search query
                </label>
                <div className="relative">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    ref={inputRef}
                    id="global-customer-search-input"
                    type="search"
                    inputMode="search"
                    enterKeyHint="search"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="PG00104897 - Tn Hamirul, phone, or email"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    className="w-full rounded-xl border border-border bg-background py-2.5 pl-10 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
                  />
                </div>
              </form>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {!debounced ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Paste a PG code, phone, email, or “PG — name” to search your full network.
                  </p>
                ) : loading ? (
                  <ResultSkeleton />
                ) : error ? (
                  <p className="px-5 py-8 text-center text-sm text-red-600 dark:text-red-400">
                    {error}
                  </p>
                ) : results.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-muted-foreground">
                    No customers found for “{debounced}”.
                  </p>
                ) : (
                  <ul className="divide-y divide-border py-1" role="listbox">
                    {results.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          role="option"
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/80 focus:outline-none focus-visible:bg-muted"
                          onClick={() => openCustomer(c)}
                        >
                          <CustomerWhatsAppAvatar
                            customerId={c.id}
                            phone={c.phone}
                            displayName={c.display_name}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-foreground">
                              {c.display_name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {secondaryLine(c)}
                            </span>
                            {c.parent_pg_code ? (
                              <span className="mt-1 inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                Parent {c.parent_pg_code}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>,
      document.body
    )

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true)
          // Keep the user-gesture chain warm for mobile keyboards.
          window.requestAnimationFrame(() => focusSearchInput())
        }}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/40"
        aria-label="Search customers"
        title="Search customers"
      >
        <SearchIcon className="h-[1.125rem] w-[1.125rem]" />
      </button>
      {dialog}
    </>
  )
}
