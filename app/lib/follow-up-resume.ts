/**
 * Local checkpoint for daily follow-up (e.g. free-account calls): last customer + filter snapshot.
 * Bookmark URL is built from pathname + ?accountStatus=&openCustomer=
 */

export const FOLLOW_UP_RESUME_STORAGE_KEY = 'crmpg_follow_up_resume_v1'

export type StoredFollowUpResume = {
  customerId: string
  saveName: string
  accountStatusFilter: string
  page: number
  viewMode: 'paginated' | 'all'
  updatedAt: number
}

/** Row shape from GET/PUT `/api/me/follow-up-bookmark` */
export type FollowUpBookmarkApiRow = {
  customer_id: string
  save_name: string
  account_status_filter: string
  page: number
  view_mode: string
  updated_at: string
}

export function storedFollowUpResumeFromApi(row: FollowUpBookmarkApiRow | null | undefined): StoredFollowUpResume | null {
  if (!row || typeof row.customer_id !== 'string' || row.customer_id.length < 10) return null
  return {
    customerId: row.customer_id,
    saveName: typeof row.save_name === 'string' ? row.save_name : 'Customer',
    accountStatusFilter: typeof row.account_status_filter === 'string' ? row.account_status_filter : '',
    page: typeof row.page === 'number' && row.page >= 1 ? row.page : 1,
    viewMode: row.view_mode === 'all' ? 'all' : 'paginated',
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  }
}

export function loadFollowUpResume(): StoredFollowUpResume | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(FOLLOW_UP_RESUME_STORAGE_KEY)
    if (!raw) return null
    const o = JSON.parse(raw) as Partial<StoredFollowUpResume>
    if (!o || typeof o.customerId !== 'string' || o.customerId.length < 10) return null
    return {
      customerId: o.customerId,
      saveName: typeof o.saveName === 'string' ? o.saveName : 'Customer',
      accountStatusFilter: typeof o.accountStatusFilter === 'string' ? o.accountStatusFilter : '',
      page: typeof o.page === 'number' && o.page >= 1 ? o.page : 1,
      viewMode: o.viewMode === 'all' ? 'all' : 'paginated',
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    }
  } catch {
    return null
  }
}

export function saveFollowUpResume(
  payload: Omit<StoredFollowUpResume, 'updatedAt'> & { updatedAt?: number }
): void {
  if (typeof window === 'undefined') return
  try {
    const row: StoredFollowUpResume = {
      ...payload,
      updatedAt: payload.updatedAt ?? Date.now(),
    }
    window.localStorage.setItem(FOLLOW_UP_RESUME_STORAGE_KEY, JSON.stringify(row))
  } catch {
    /* quota / private mode */
  }
}

export function clearFollowUpResume(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(FOLLOW_UP_RESUME_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

export function buildFollowUpResumeUrl(params: {
  origin: string
  pathname: string
  customerId: string
  accountStatusFilter: string
}): string {
  const sp = new URLSearchParams()
  if (params.accountStatusFilter) {
    sp.set('accountStatus', params.accountStatusFilter)
  }
  sp.set('openCustomer', params.customerId)
  const q = sp.toString()
  return `${params.origin}${params.pathname}${q ? `?${q}` : ''}`
}
