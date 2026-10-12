'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/contexts/auth-context'
import { useCustomerEditModal } from '@/app/contexts/customer-edit-modal-context'
import { CustomerWhatsAppAvatar } from '@/app/customers/_components/CustomerWhatsAppAvatar'
import {
  getAccountStatusKey,
  getAccountStatusLabel,
  getBusinessRankBucket,
  getBusinessRankBucketLabel,
  parseOriginalDataCount,
  type AccountStatusKey,
} from '@/app/lib/customer-account-status'
import {
  fetchDealerFrontline,
  type CustomerListRow,
  type FrontlinePathNode,
} from '@/app/lib/customers/fetch-customers'
import { hasRealPgCode, normalizePgCodeValue } from '@/app/lib/customers/pg-code'
import { customerKeys } from '@/app/lib/customers/query-keys'
import { isValidCampaignPhone, normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'

const ACCOUNT_STATUS_ROW_CLASSES: Record<AccountStatusKey, string> = {
  active: 'customer-row customer-row--active',
  inactive: 'customer-row customer-row--inactive',
  free: 'customer-row customer-row--free',
  freeze: 'customer-row customer-row--freeze',
  temporary: 'customer-row customer-row--temporary',
  unknown: 'customer-row customer-row--unknown',
}

export type DealerFrontlineSeed = {
  id: string
  pg_code: string
  name: string
  /** BC Total Frontline from original_data — used to spot stale parent links. */
  expected_frontline?: number | null
}

type Props = {
  open: boolean
  dealer: DealerFrontlineSeed | null
  onClose: () => void
}

function WhatsAppOpenButton({ phone }: { phone: string | null | undefined }) {
  if (!isValidCampaignPhone(phone)) return null
  const msisdn = normalizePhoneToMsisdn(String(phone))
  const href = `https://api.whatsapp.com/send?phone=${encodeURIComponent(msisdn)}`

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Open WhatsApp (${msisdn})`}
      aria-label={`Open WhatsApp chat for ${msisdn}`}
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#25D366] transition-colors hover:bg-muted"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  )
}

function RatioRing({
  percent,
  stroke,
  track,
  label,
  fraction,
}: {
  percent: number
  stroke: string
  track: string
  label: string
  fraction: string
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  const r = 36
  const c = 2 * Math.PI * r
  const offset = c - (clamped / 100) * c

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-3">
      <div className="relative h-20 w-20 shrink-0">
        <svg className="h-20 w-20 -rotate-90" viewBox="0 0 88 88" aria-hidden>
          <circle cx="44" cy="44" r={r} fill="none" strokeWidth="8" stroke={track} />
          <circle
            cx="44"
            cy="44"
            r={r}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            stroke={stroke}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-semibold tabular-nums text-foreground">{clamped}%</span>
        </div>
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-snug text-muted-foreground">{label}</p>
        <p className="mt-1 text-sm font-semibold tabular-nums text-foreground">{fraction}</p>
      </div>
    </div>
  )
}

export function DealerFrontlineModal({ open, dealer, onClose }: Props) {
  const { user } = useAuth()
  const { openCustomerById } = useCustomerEditModal()
  const [currentPg, setCurrentPg] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [expandedTree, setExpandedTree] = useState(true)
  const limit = 50

  useEffect(() => {
    if (!open || !dealer) return
    setCurrentPg(normalizePgCodeValue(dealer.pg_code))
    setSearchInput('')
    setSearch('')
    setPage(1)
    setExpandedTree(true)
  }, [open, dealer])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => window.clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  const frontlineParams = useMemo(
    () => ({ search, page, limit }),
    [search, page]
  )

  const frontlineQuery = useQuery({
    queryKey: customerKeys.frontline(
      user?.id ?? '',
      currentPg,
      dealer?.id ?? '',
      frontlineParams
    ),
    queryFn: () =>
      fetchDealerFrontline({
        parentPgCode: currentPg,
        search,
        page,
        limit,
      }),
    enabled: Boolean(user?.id) && open && Boolean(currentPg),
    staleTime: 30_000,
    // Keep prior page only while paging/searching the same node — never bleed
    // another dealer's frontline into the current Tree Tier view.
    placeholderData: (previousData) => {
      if (!previousData) return undefined
      const prevParent = normalizePgCodeValue(previousData.parent?.pg_code)
      if (prevParent && prevParent === currentPg) return previousData
      return undefined
    },
  })

  const queryMatchesCurrent =
    normalizePgCodeValue(frontlineQuery.data?.parent?.pg_code) === currentPg
  const rows = (
    queryMatchesCurrent ? (frontlineQuery.data?.data ?? []) : []
  ) as CustomerListRow[]
  const path: FrontlinePathNode[] = queryMatchesCurrent
    ? (frontlineQuery.data?.path ?? [])
    : []
  const ratios = queryMatchesCurrent
    ? (frontlineQuery.data?.ratios ?? { total: 0, active: 0, inactive_free: 0 })
    : { total: 0, active: 0, inactive_free: 0 }
  const total = queryMatchesCurrent ? (frontlineQuery.data?.total ?? 0) : 0
  const totalPages = queryMatchesCurrent
    ? (frontlineQuery.data?.totalPages ?? 1)
    : 1
  const parentNode = queryMatchesCurrent ? frontlineQuery.data?.parent : undefined
  const parentPgLinked = queryMatchesCurrent
    ? (frontlineQuery.data?.parent_pg_linked ?? false)
    : false
  const emptyMessage = queryMatchesCurrent ? frontlineQuery.data?.message : null
  const columnMatchTotal = queryMatchesCurrent
    ? (frontlineQuery.data?.column_match_total ?? 0)
    : 0
  const expectedFrontline = dealer?.expected_frontline ?? null
  const isLoading =
    (frontlineQuery.isLoading || frontlineQuery.isFetching) && !queryMatchesCurrent
  const countLooksWrong =
    queryMatchesCurrent &&
    !isLoading &&
    expectedFrontline != null &&
    expectedFrontline > 0 &&
    total > expectedFrontline * 1.35
  const error =
    frontlineQuery.isError
      ? frontlineQuery.error instanceof Error
        ? frontlineQuery.error.message
        : 'Failed to load frontline'
      : null

  const activePct = ratios.total > 0 ? Math.round((ratios.active / ratios.total) * 100) : 0
  const inactivePct =
    ratios.total > 0 ? Math.round((ratios.inactive_free / ratios.total) * 100) : 0

  const navigateTo = (pg: string) => {
    const next = normalizePgCodeValue(pg)
    if (!next || next === currentPg) return
    setCurrentPg(next)
    setSearchInput('')
    setSearch('')
    setPage(1)
  }

  if (!open || !dealer) return null

  return (
    <div
      className="fixed inset-0 z-[1100] flex items-end justify-center overflow-hidden overscroll-none sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dealer-frontline-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px] dark:bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />

      <div className="relative flex max-h-[min(92vh,900px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card text-card-foreground shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 id="dealer-frontline-title" className="text-lg font-semibold text-foreground">
              Direct frontline
            </h2>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {parentNode?.name || dealer.name}
              {parentNode?.pg_code || dealer.pg_code
                ? ` · ${parentNode?.pg_code || dealer.pg_code}`
                : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-background px-4 py-4 sm:px-5">
          <section className="rounded-xl border border-border bg-muted/40 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                Tree Tier{' '}
                <span className="font-normal text-muted-foreground">
                  (Navigate by clicking a name. Expand to browse frontline.)
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setExpandedTree((v) => !v)}
                className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {expandedTree ? 'Collapse' : 'Expand'}
              </button>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-[280px] text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-4 font-semibold">Tier</th>
                    <th className="pb-2 font-semibold">Name</th>
                  </tr>
                </thead>
                <tbody>
                  {[...path].reverse().map((node, idx, arr) => {
                    const tier = arr.length - 1 - idx
                    const isCurrent = node.pg_code === currentPg
                    return (
                      <tr
                        key={`${node.pg_code}-${tier}`}
                        className={isCurrent ? 'bg-card/80' : undefined}
                      >
                        <td className="py-1.5 pr-4 tabular-nums text-foreground">{tier}</td>
                        <td className="py-1.5">
                          <button
                            type="button"
                            onClick={() => navigateTo(node.pg_code)}
                            className={`text-left underline-offset-2 hover:underline ${
                              isCurrent
                                ? 'font-semibold text-foreground'
                                : 'font-medium text-primary'
                            }`}
                          >
                            {node.name} ({node.pg_code})
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {path.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-2 text-sm text-muted-foreground">
                        {dealer.name} ({normalizePgCodeValue(dealer.pg_code)})
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {expandedTree && rows.length > 0 ? (
              <div className="mt-3 border-t border-border pt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Frontline under current node
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                  {rows.map((row) => {
                    const pg = normalizePgCodeValue(row.pg_code)
                    const label = row.sender_name || row.name || pg
                    return (
                      <li key={row.id}>
                        <button
                          type="button"
                          disabled={!hasRealPgCode(pg)}
                          onClick={() => navigateTo(pg)}
                          className="w-full truncate rounded-md px-2 py-1 text-left text-primary hover:bg-muted disabled:cursor-not-allowed disabled:text-muted-foreground"
                        >
                          {label} ({pg})
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
          </section>

          <section className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <RatioRing
              percent={activePct}
              stroke="#34d399"
              track="color-mix(in oklab, var(--muted-foreground) 25%, transparent)"
              label="Monthly Active Account Ratio of Total Frontline"
              fraction={`${ratios.active} / ${ratios.total}`}
            />
            <RatioRing
              percent={inactivePct}
              stroke="#fb7185"
              track="color-mix(in oklab, var(--muted-foreground) 25%, transparent)"
              label="Inactive / Free / Freeze Ratio of Total Frontline"
              fraction={`${ratios.inactive_free} / ${ratios.total}`}
            />
          </section>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search this frontline…"
              className="w-full flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              onClick={() => void frontlineQuery.refetch()}
              disabled={frontlineQuery.isFetching}
              className="rounded-xl border border-border bg-card px-3 py-2.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
            >
              {frontlineQuery.isFetching ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {error ? (
            <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {!isLoading && (emptyMessage || countLooksWrong) && !error ? (
            <div
              className={`mt-3 rounded-xl border px-4 py-3 text-sm ${
                countLooksWrong || (columnMatchTotal > total && total > 0)
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-100'
                  : 'border-border bg-muted/60 text-muted-foreground'
              }`}
            >
              {countLooksWrong ? (
                <>
                  This list may include the wrong parent tier (
                  {total.toLocaleString()} shown vs ~{expectedFrontline!.toLocaleString()} on BC).
                  Open {dealer.name} in Business Center Tree Tier, then use extension{' '}
                  <strong>Sync open Tree Tier (all pages)</strong>.
                </>
              ) : null}
              {!countLooksWrong && emptyMessage ? emptyMessage : null}
              {!countLooksWrong &&
              !emptyMessage &&
              columnMatchTotal > total &&
              total > 0 ? (
                <>
                  Filtered {columnMatchTotal.toLocaleString()} stale links down to{' '}
                  {total.toLocaleString()} direct frontline for this dealer. Re-sync their Tree
                  Tier in BC to refresh all parent links.
                </>
              ) : null}
            </div>
          ) : null}

          {!parentPgLinked && !isLoading && total === 0 && !error && !emptyMessage ? (
            <div className="mt-3 rounded-xl border border-border bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
              Parent PG links are not populated yet. After BC sync writes parent_pg_code, this list
              will show direct frontline (Temporary excluded).
            </div>
          ) : null}

          <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
              <p className="text-sm text-muted-foreground">
                {isLoading
                  ? 'Loading…'
                  : `${total.toLocaleString()} frontline member${total === 1 ? '' : 's'}`}
                <span className="ml-1 text-xs opacity-80">(Temporary excluded)</span>
              </p>
            </div>
            <div className="max-h-[min(42vh,420px)] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    {['View', 'Name', 'PG Code', 'Status', 'Rank', 'Frontline'].map((label) => (
                      <th
                        key={label}
                        className="sticky top-0 z-10 border-b border-border bg-muted px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-foreground"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-card">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                        {isLoading ? 'Loading…' : 'No direct frontline for this node'}
                      </td>
                    </tr>
                  ) : (
                    rows.map((customer) => {
                      const accountKey = getAccountStatusKey(customer)
                      const rankBucket = getBusinessRankBucket(customer.original_data)
                      const frontline = parseOriginalDataCount(
                        customer.original_data,
                        'Total Frontline'
                      )
                      const childPg = normalizePgCodeValue(customer.pg_code)
                      const canDrill = hasRealPgCode(childPg)

                      return (
                        <tr
                          key={customer.id}
                          className={`transition-colors ${ACCOUNT_STATUS_ROW_CLASSES[accountKey]}`}
                        >
                          <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={!canDrill}
                              onClick={() => navigateTo(childPg)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/25 transition-colors hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-40"
                              title="View this member’s frontline"
                              aria-label={`View frontline of ${customer.sender_name || customer.name || childPg}`}
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                              >
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
                            </button>
                          </td>
                          <td className="px-3 py-2.5 text-sm" onClick={(e) => e.stopPropagation()}>
                            <span className="inline-flex max-w-full items-center gap-2">
                              <CustomerWhatsAppAvatar
                                customerId={customer.id}
                                phone={customer.phone}
                                displayName={customer.sender_name || customer.name}
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  openCustomerById(customer.id, {
                                    tab: 'details',
                                    initialCustomer: customer as unknown as Record<string, unknown>,
                                  })
                                }
                                className="min-w-0 truncate font-medium text-primary underline underline-offset-2 hover:opacity-90"
                              >
                                {customer.sender_name || customer.name || '-'}
                              </button>
                              <WhatsAppOpenButton phone={customer.phone} />
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm tabular-nums text-foreground">
                            {childPg || '-'}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-foreground">
                            {getAccountStatusLabel(customer)}
                          </td>
                          <td className="px-3 py-2.5 text-sm text-foreground">
                            <span className="inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-primary/20">
                              {getBusinessRankBucketLabel(rankBucket)}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm tabular-nums text-foreground">
                            {frontline == null ? '-' : frontline.toLocaleString()}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between border-t border-border px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
