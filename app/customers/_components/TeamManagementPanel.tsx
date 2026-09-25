'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAuth } from '@/app/contexts/auth-context'
import { CustomerWhatsAppAvatar } from '@/app/customers/_components/CustomerWhatsAppAvatar'
import {
  getAccountStatusKey,
  getBusinessRankBucket,
  getBusinessRankBucketLabel,
  parseOriginalDataCount,
  type AccountStatusKey,
  type NetworkSizeBucket,
} from '@/app/lib/customer-account-status'
import { fetchCustomerList, type CustomerListRow } from '@/app/lib/customers/fetch-customers'
import { customerKeys, type CustomerListQueryParams } from '@/app/lib/customers/query-keys'
import { isValidCampaignPhone, normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'

const ACCOUNT_STATUS_ROW_CLASSES: Record<AccountStatusKey, string> = {
  active: 'bg-green-50/80 hover:bg-green-100/80 border-l-4 border-l-green-500',
  inactive: 'bg-red-50/80 hover:bg-red-100/80 border-l-4 border-l-red-500',
  free: 'bg-amber-50/80 hover:bg-amber-100/80 border-l-4 border-l-amber-500',
  freeze: 'bg-orange-50/80 hover:bg-orange-100/80 border-l-4 border-l-orange-500',
  temporary: 'bg-violet-50/80 hover:bg-violet-100/80 border-l-4 border-l-violet-500',
  unknown: 'bg-slate-50 hover:bg-slate-100/80 border-l-4 border-l-slate-400',
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
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[#25D366] transition-colors hover:bg-emerald-50 hover:text-emerald-700"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    </a>
  )
}

type TeamCustomer = CustomerListRow

type TeamManagementPanelProps = {
  active: boolean
  onOpenCustomer: (customer: TeamCustomer) => void
}

export function TeamManagementPanel({ active, onOpenCustomer }: TeamManagementPanelProps) {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [totalFrontline, setTotalFrontline] = useState<NetworkSizeBucket | ''>('')
  const [empireSize, setEmpireSize] = useState<NetworkSizeBucket | ''>('')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [sortBy, setSortBy] = useState('total_frontline')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 350)
    return () => window.clearTimeout(t)
  }, [searchInput])

  const listParams = useMemo<CustomerListQueryParams>(
    () => ({
      page,
      limit,
      sortBy,
      sortOrder,
      search,
      gender: '',
      ethnicity: '',
      ageMin: 0,
      ageMax: 120,
      ageFilterMin: 0,
      ageFilterMax: 120,
      birthday: '',
      accountStatus: '',
      profileVerified: '',
      directDebit: '',
      acquisitionSource: '',
      registerMonth: '',
      lastPurchaseMonth: '',
      tagIds: [],
      viewMode: 'paginated',
      businessRank: 'dealers',
      totalFrontline,
      empireSize,
    }),
    [page, limit, sortBy, sortOrder, search, totalFrontline, empireSize]
  )

  const teamQuery = useQuery({
    queryKey: customerKeys.teamList(user?.id ?? '', listParams),
    queryFn: () => fetchCustomerList(listParams),
    enabled: Boolean(user?.id) && active,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: keepPreviousData,
  })

  const rows = Array.isArray(teamQuery.data?.data) ? (teamQuery.data.data as TeamCustomer[]) : []
  const total = teamQuery.data?.total ?? 0
  const totalPages = teamQuery.data?.totalPages ?? 1
  const isLoading = teamQuery.isLoading && !teamQuery.data
  const isFetching = teamQuery.isFetching
  const error =
    teamQuery.isError
      ? teamQuery.error instanceof Error
        ? teamQuery.error.message
        : 'Failed to load team'
      : null

  const hasActiveFilters = Boolean(search || totalFrontline || empireSize)

  const clearFilters = useCallback(() => {
    setSearchInput('')
    setSearch('')
    setTotalFrontline('')
    setEmpireSize('')
    setPage(1)
  }, [])

  const toggleSort = (column: string) => {
    if (sortBy === column) {
      setSortOrder((o) => (o === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortOrder(column === 'total_frontline' || column === 'empire_size' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Team management</h2>
            <p className="mt-1 text-sm text-slate-600">
              Dealers only (Rank contains dealer). Cached for faster grid loads.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void teamQuery.refetch()}
            disabled={isFetching}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {isFetching ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4">
          <label className="sr-only" htmlFor="team-search">
            Search team
          </label>
          <div className="relative">
            <input
              id="team-search"
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by name, email, phone, or PG code..."
              className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-4 pr-10 text-sm text-slate-900 shadow-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchInput ? (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('')
                  setSearch('')
                  setPage(1)
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label="Clear search"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-left text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <span>Filters{hasActiveFilters ? ' (active)' : ''}</span>
            <svg
              className={`h-4 w-4 text-slate-500 transition-transform ${filtersOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {filtersOpen ? (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total Frontline
                </span>
                <select
                  value={totalFrontline}
                  onChange={(e) => {
                    setTotalFrontline(e.target.value as NetworkSizeBucket | '')
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All frontline sizes</option>
                  <option value="pre-md">Pre-MD (≤50)</option>
                  <option value="md">MD (300+)</option>
                  <option value="fmd">FMD (500+)</option>
                  <option value="sfmd">SFMD (1000+)</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Empire size
                </span>
                <select
                  value={empireSize}
                  onChange={(e) => {
                    setEmpireSize(e.target.value as NetworkSizeBucket | '')
                    setPage(1)
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All empire sizes</option>
                  <option value="pre-md">Pre-MD (≤50)</option>
                  <option value="md">MD (300+)</option>
                  <option value="fmd">FMD (500+)</option>
                  <option value="sfmd">SFMD (1000+)</option>
                </select>
              </label>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  disabled={!hasActiveFilters}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Clear filters
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      <div className="rounded-2xl border border-slate-200/50 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="text-sm text-slate-600">
            {isLoading ? 'Loading dealers…' : `${total.toLocaleString()} dealer${total === 1 ? '' : 's'}`}
            {isFetching && !isLoading ? (
              <span className="ml-2 text-xs text-slate-400">Updating…</span>
            ) : null}
          </p>
        </div>

        <div className="max-h-[min(65vh,640px)] overflow-auto overscroll-contain rounded-b-2xl">
          <table className="min-w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-900 shadow-[0_1px_0_0_rgb(203,213,225)]">
                  Sender Name
                </th>
                <th className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-900 shadow-[0_1px_0_0_rgb(203,213,225)]">
                  <button
                    type="button"
                    onClick={() => toggleSort('total_frontline')}
                    className="inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title={
                      sortOrder === 'desc'
                        ? 'Highest frontline first (click for lowest)'
                        : 'Lowest frontline first (click for highest)'
                    }
                  >
                    Total Frontline
                    {sortBy === 'total_frontline' ? (
                      <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-900 shadow-[0_1px_0_0_rgb(203,213,225)]">
                  <button
                    type="button"
                    onClick={() => toggleSort('empire_size')}
                    className="inline-flex items-center gap-1 rounded uppercase tracking-wider hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title={
                      sortOrder === 'desc'
                        ? 'Highest empire first (click for lowest)'
                        : 'Lowest empire first (click for highest)'
                    }
                  >
                    Empire Size
                    {sortBy === 'empire_size' ? (
                      <span className="text-[10px]">{sortOrder === 'desc' ? '↓' : '↑'}</span>
                    ) : null}
                  </button>
                </th>
                <th className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-900 shadow-[0_1px_0_0_rgb(203,213,225)]">
                  Rank
                </th>
                <th className="sticky top-0 z-30 border-b-2 border-slate-300 bg-slate-100 px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-900 shadow-[0_1px_0_0_rgb(203,213,225)]">
                  Location
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    {isLoading ? 'Loading…' : 'No dealers found'}
                  </td>
                </tr>
              ) : (
                rows.map((customer) => {
                  const accountKey = getAccountStatusKey(customer)
                  const rankBucket = getBusinessRankBucket(customer.original_data)
                  const frontline = parseOriginalDataCount(customer.original_data, 'Total Frontline')
                  const empire = parseOriginalDataCount(customer.original_data, 'Empire Size')

                  return (
                    <tr
                      key={customer.id}
                      onClick={() => onOpenCustomer(customer)}
                      className={`cursor-pointer transition-colors ${ACCOUNT_STATUS_ROW_CLASSES[accountKey]}`}
                    >
                      <td
                        className="px-4 py-3 text-sm text-slate-800"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <span className="inline-flex max-w-full items-center gap-2">
                          <CustomerWhatsAppAvatar
                            customerId={customer.id}
                            phone={customer.phone}
                            displayName={customer.sender_name || customer.name}
                          />
                          <span className="min-w-0 truncate">{customer.sender_name || '-'}</span>
                          <WhatsAppOpenButton phone={customer.phone} />
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-800">
                        {frontline == null ? '-' : frontline.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm tabular-nums text-slate-800">
                        {empire == null ? '-' : empire.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800">
                        <span className="inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 ring-1 ring-indigo-200/80">
                          {getBusinessRankBucketLabel(rankBucket)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-800">{customer.location || '-'}</td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && !(totalFrontline || empireSize || search) ? (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-700">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        ) : (
          <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
            Showing {rows.length.toLocaleString()} of {total.toLocaleString()} dealers
          </div>
        )}
      </div>
    </div>
  )
}
