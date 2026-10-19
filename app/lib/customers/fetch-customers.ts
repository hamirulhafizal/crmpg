import type { QueryClient } from '@tanstack/react-query'
import type { AccountStatusKey } from '@/app/lib/customer-account-status'
import {
  customerKeys,
  DEFAULT_CUSTOMER_LIST_PARAMS,
  type CustomerListQueryParams,
} from '@/app/lib/customers/query-keys'
import {
  getCachedWhatsAppAvatarUrl,
  setCachedWhatsAppAvatarUrl,
} from '@/app/lib/customers/avatar-url-cache'

const CUSTOMERS_PREFETCH_STALE_MS = 60_000
const CUSTOMERS_PREFETCH_GC_MS = 10 * 60_000

export type CustomerListRow = {
  id: string
  name: string | null
  dob: string | null
  email: string | null
  phone: string | null
  location: string | null
  gender: string | null
  ethnicity: string | null
  age: number | null
  prefix: string | null
  first_name: string | null
  sender_name: string | null
  save_name: string | null
  pg_code: string | null
  parent_pg_code?: string | null
  row_number: number | null
  original_data: unknown
  is_married: boolean | null
  is_friend: boolean | null
  created_at: string
  updated_at: string
  last_purchase_at?: string | null
  is_monthly_buyer?: boolean | null
  segment_attributes?: Record<string, unknown> | null
  phone_contact_status?: string | null
}

export type FrontlinePathNode = {
  id: string | null
  pg_code: string
  name: string
}

export type FrontlineResult = {
  data: CustomerListRow[]
  total: number
  totalPages: number
  page: number
  limit: number
  parent: FrontlinePathNode
  root_pg_code: string | null
  path: FrontlinePathNode[]
  ratios: {
    total: number
    active: number
    inactive_free: number
  }
  parent_pg_linked: boolean
  column_match_total?: number
  message: string | null
}

export type CustomerListResult = {
  data: CustomerListRow[]
  total: number
  totalPages: number
}

export type CustomerStatsResult = {
  counts: Record<AccountStatusKey, number>
}

function buildListSearchParams(params: CustomerListQueryParams): URLSearchParams {
  const shouldFetchAll =
    params.viewMode === 'all' || params.birthday === 'today' || params.birthday === 'month'
  const effectiveLimit = shouldFetchAll ? '100000' : String(params.limit)
  const effectivePage = shouldFetchAll ? '1' : String(params.page)

  const qs = new URLSearchParams({
    page: effectivePage,
    limit: effectiveLimit,
    sortBy: params.sortBy,
    sortOrder: params.sortOrder,
  })

  if (params.search) qs.append('search', params.search)
  if (params.gender) qs.append('gender', params.gender)
  if (params.ethnicity) qs.append('ethnicity', params.ethnicity)
  if (params.nationality) qs.append('nationality', params.nationality)
  if (params.ageMin > params.ageFilterMin) qs.append('ageMin', String(params.ageMin))
  if (params.ageMax < params.ageFilterMax) qs.append('ageMax', String(params.ageMax))
  if (params.birthday) qs.append('birthday', params.birthday)
  if (params.accountStatus) qs.append('accountStatus', params.accountStatus)
  if (params.profileVerified) qs.append('profileVerified', params.profileVerified)
  if (params.directDebit) qs.append('directDebit', params.directDebit)
  if (params.acquisitionSource) qs.append('acquisitionSource', params.acquisitionSource)
  if (params.registerMonth) qs.append('registerMonth', params.registerMonth)
  if (params.lastPurchaseMonth) qs.append('lastPurchaseMonth', params.lastPurchaseMonth)
  if (params.tagIds.length > 0) qs.set('tagIds', params.tagIds.join(','))
  if (params.phoneContactStatus) qs.append('phoneContactStatus', params.phoneContactStatus)
  if (params.businessRank) qs.append('businessRank', params.businessRank)
  if (params.totalFrontline) qs.append('totalFrontline', params.totalFrontline)
  if (params.empireSize) qs.append('empireSize', params.empireSize)

  return qs
}

export async function fetchCustomerList(
  params: CustomerListQueryParams
): Promise<CustomerListResult> {
  const response = await fetch(`/api/customers?${buildListSearchParams(params)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || 'Failed to fetch customers')
  }
  return {
    data: Array.isArray(result.data) ? result.data : [],
    total: result.pagination?.total || 0,
    totalPages: result.pagination?.totalPages || 1,
  }
}

export async function fetchCustomerStats(): Promise<CustomerStatsResult> {
  const response = await fetch('/api/customers/stats', {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const result = await response.json()
  if (!response.ok) {
    throw new Error(result.error || 'Failed to load stats')
  }
  return {
    counts: (result.counts && typeof result.counts === 'object' ? result.counts : {}) as Record<
      AccountStatusKey,
      number
    >,
  }
}

export async function fetchDealerFrontline(params: {
  parentPgCode: string
  search?: string
  page?: number
  limit?: number
}): Promise<FrontlineResult> {
  const qs = new URLSearchParams({
    parent_pg_code: params.parentPgCode,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  })
  if (params.search?.trim()) qs.set('search', params.search.trim())

  const response = await fetch(`/api/customers/frontline?${qs}`, {
    cache: 'no-store',
    credentials: 'same-origin',
  })
  const result = (await response.json()) as FrontlineResult & { error?: string }
  if (!response.ok) {
    throw new Error(result.error || 'Failed to load frontline')
  }
  return {
    data: Array.isArray(result.data) ? result.data : [],
    total: result.total ?? 0,
    totalPages: result.totalPages ?? 1,
    page: result.page ?? params.page ?? 1,
    limit: result.limit ?? params.limit ?? 50,
    parent: result.parent,
    root_pg_code: result.root_pg_code ?? null,
    path: Array.isArray(result.path) ? result.path : [],
    ratios: result.ratios ?? { total: 0, active: 0, inactive_free: 0 },
    parent_pg_linked: Boolean(result.parent_pg_linked),
    message: result.message ?? null,
  }
}

export async function fetchCustomerAvatarUrl(
  customerId: string,
  userId?: string
): Promise<string | null> {
  if (userId) {
    const cached = getCachedWhatsAppAvatarUrl(userId, customerId)
    // undefined = miss; null = known empty (still reuse to avoid WAHA hits)
    if (cached !== undefined) return cached
  }

  const response = await fetch(`/api/customers/${encodeURIComponent(customerId)}/profile-picture`, {
    credentials: 'same-origin',
  })
  const result = (await response.json().catch(() => ({}))) as {
    profilePictureURL?: string | null
    error?: string
  }
  if (!response.ok) {
    if (response.status === 400 || response.status === 404) {
      if (userId) setCachedWhatsAppAvatarUrl(userId, customerId, null, 5 * 60_000)
      return null
    }
    throw new Error(result.error || 'Failed to fetch profile picture')
  }
  const url =
    typeof result.profilePictureURL === 'string' && result.profilePictureURL.trim()
      ? result.profilePictureURL.trim()
      : null

  if (userId) {
    setCachedWhatsAppAvatarUrl(userId, customerId, url, url ? 24 * 60 * 60_000 : 30 * 60_000)
  }
  return url
}

/** Warm React Query cache for the default Customers workspace (list + stats). */
export function prefetchDefaultCustomersWorkspace(
  queryClient: QueryClient,
  userId: string
): void {
  if (!userId) return

  void queryClient.prefetchQuery({
    queryKey: customerKeys.list(userId, DEFAULT_CUSTOMER_LIST_PARAMS),
    queryFn: () => fetchCustomerList(DEFAULT_CUSTOMER_LIST_PARAMS),
    staleTime: CUSTOMERS_PREFETCH_STALE_MS,
    gcTime: CUSTOMERS_PREFETCH_GC_MS,
  })

  void queryClient.prefetchQuery({
    queryKey: customerKeys.stats(userId),
    queryFn: fetchCustomerStats,
    staleTime: CUSTOMERS_PREFETCH_STALE_MS,
    gcTime: CUSTOMERS_PREFETCH_GC_MS,
  })
}
