'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useEffect, useState, useCallback, useRef, useMemo, Suspense, useLayoutEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import { UserProfileMenu } from '@/app/components/UserProfileMenu'
import GoogleContactsIntegration from '@/app/components/GoogleContactsIntegration'
import {
  CustomerEditModalShell,
  type CustomerEditModalTab,
} from '@/app/components/customer-edit-modal/CustomerEditModalShell'
import {
  getAccountStatusKey,
  getAccountStatusLabel,
  formatLastPurchaseDisplayForUi,
  type AccountStatusKey,
  getSalesJourneyStageKey,
  getSalesJourneyStageLabel,
  SALES_JOURNEY_STAGE_ORDER,
  type SalesJourneyStageKey,
  getBusinessRankBucket,
  getBusinessRankBucketLabel,
  type BusinessRankBucket,
} from '@/app/lib/customer-account-status'
import {
  loadFollowUpResume,
  saveFollowUpResume,
  clearFollowUpResume,
  buildFollowUpResumeUrl,
  storedFollowUpResumeFromApi,
  type StoredFollowUpResume,
} from '@/app/lib/follow-up-resume'
import { CrmTagMultiSelect } from '@/app/customers/_components/CrmTagMultiSelect'
import { displayCustomerAge } from '@/app/lib/customer-dob'
import {
  customerPortalLoginUrl,
  PORTAL_BRAND,
} from '@/app/lib/customer-portal/brand'

const EMPTY_STATUS_COUNTS: Record<AccountStatusKey, number> = {
  temporary: 0,
  freeze: 0,
  active: 0,
  free: 0,
  inactive: 0,
  unknown: 0,
}

/** Rank buckets in overview funnel + cards (pipeline order). */
const RANK_OVERVIEW_BUCKETS: BusinessRankBucket[] = [
  'customer',
  'dealer',
  'priority_dealer',
  'master_dealer',
  'other',
]

const RANK_FUNNEL_SEGMENT_FILLS = ['#cbd5e1', '#a5b4fc', '#818cf8', '#6366f1', '#4338ca'] as const

/** Table row tint + left accent — aligns with Account status summary cards. */
const ACCOUNT_STATUS_ROW_CLASSES: Record<AccountStatusKey, string> = {
  active: 'bg-green-50/80 hover:bg-green-100/80 border-l-4 border-l-green-500',
  inactive: 'bg-red-50/80 hover:bg-red-100/80 border-l-4 border-l-red-500',
  free: 'bg-amber-50/80 hover:bg-amber-100/80 border-l-4 border-l-amber-500',
  freeze: 'bg-orange-50/80 hover:bg-orange-100/80 border-l-4 border-l-orange-500',
  temporary: 'bg-violet-50/80 hover:bg-violet-100/80 border-l-4 border-l-violet-500',
  unknown: 'bg-slate-50 hover:bg-slate-100/80 border-l-4 border-l-slate-400',
}

const AGE_FILTER_MIN = 0
const AGE_FILTER_MAX = 100

/** Valid `accountStatus` query param for bookmark / resume URLs */
const ACCOUNT_STATUS_QUERY = new Set<string>([
  'temporary',
  'freeze',
  'active',
  'free',
  'inactive',
  'unknown',
])

function accountStatusQueueTitle(status: AccountStatusKey): string {
  switch (status) {
    case 'active':
      return 'Active'
    case 'inactive':
      return 'Inactive'
    case 'free':
      return 'Free account'
    case 'freeze':
      return 'Freeze'
    case 'temporary':
      return 'Temporary'
    case 'unknown':
      return 'Unknown'
    default:
      return status
  }
}

const runConfetti = () => {
  if (typeof window === 'undefined') return
  import('canvas-confetti').then(({ default: confetti }) => {
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.7 },
      colors: ['#0ea5e9', '#22c55e', '#eab308', '#a855f7', '#ec4899'],
    })
  })
}

interface Customer {
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
  row_number: number | null
  original_data: any
  is_married: boolean | null
  is_friend: boolean | null
  created_at: string
  updated_at: string
  last_purchase_at?: string | null
  is_monthly_buyer?: boolean | null
  segment_attributes?: Record<string, unknown> | null
}

interface TagCategoryDto {
  id: string
  key: string
  name: string
  sort_order: number
  allows_multiple: boolean
}

interface TagDto {
  id: string
  category_id: string
  slug: string
  label: string
}

/** JSON columns sometimes arrive as string; normalize so Verified / account UI stay correct. */
const normalizeCustomerOriginalData = (originalData: unknown): Record<string, unknown> | null => {
  if (originalData == null) return null
  if (typeof originalData === 'object' && !Array.isArray(originalData)) {
    return originalData as Record<string, unknown>
  }
  if (typeof originalData === 'string') {
    const s = originalData.trim()
    if (!s) return null
    try {
      const parsed = JSON.parse(s) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return null
    }
  }
  return null
}

const parseProfileVerified = (originalData: any): boolean | null => {
  const data = normalizeCustomerOriginalData(originalData)
  if (!data) return null
  const raw = data['Profile Verified']

  if (raw === undefined || raw === null || raw === '') return null
  if (raw === true) return true
  if (raw === false) return false

  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (['true', 'yes', 'y', '1'].includes(v)) return true
    if (['false', 'no', 'n', '0'].includes(v)) return false
  }

  if (typeof raw === 'number') {
    if (raw === 1) return true
    if (raw === 0) return false
  }

  return null
}

const parseDirectDebitSubscription = (originalData: any): boolean | null => {
  const data = normalizeCustomerOriginalData(originalData)
  if (!data) return null
  const raw = data['Direct Debit Subscription']

  if (raw === undefined || raw === null || raw === '') return null
  if (raw === true) return true
  if (raw === false) return false

  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase()
    if (['true', 'yes', 'y', '1', 'active', 'subscribed'].includes(v)) return true
    if (['false', 'no', 'n', '0', 'inactive', 'none'].includes(v)) return false
  }

  if (typeof raw === 'number') {
    if (raw === 1) return true
    if (raw === 0) return false
  }

  return null
}

const deriveCustomerSource = (
  originalData: unknown,
  segmentAttributes?: Record<string, unknown> | null
): 'google_ads' | 'referral' | 'social_media' | 'offline' | 'import' | 'other' | 'unknown' => {
  const segSourceRaw =
    segmentAttributes?.source ??
    segmentAttributes?.lead_source ??
    segmentAttributes?.channel ??
    segmentAttributes?.acquisition_source
  const data = normalizeCustomerOriginalData(originalData)
  const raw = segSourceRaw ?? data?.['Source'] ?? data?.['source']
  const value = raw == null ? '' : String(raw).trim().toLowerCase()
  if (!value) return 'unknown'
  if (value.includes('gap registration form') || value.includes('google ads')) return 'google_ads'
  if (value.includes('referral') || value.includes('network')) return 'referral'
  if (
    value.includes('social') ||
    value.includes('socmed') ||
    value.includes('facebook') ||
    value.includes('tiktok') ||
    value.includes('instagram')
  ) {
    return 'social_media'
  }
  if (
    value.includes('walk in') ||
    value.includes('walk-in') ||
    value.includes('offline') ||
    value.includes('booth') ||
    value.includes('event')
  ) {
    return 'offline'
  }
  if (value.includes('extension') || value.includes('import') || value.includes('sync')) return 'import'
  return 'other'
}

const parseOriginalDateToUTC = (value: unknown): number | null => {
  if (!value) return null
  if (typeof value !== 'string') return null

  const s = value.trim()
  // Expected format coming from your data source: `YYYY-MM-DD HH:mm:ss`
  // Convert to a UTC timestamp to avoid timezone ambiguity.
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/
  )
  if (!m) {
    const fallback = new Date(s)
    const t = fallback.getTime()
    return Number.isFinite(t) ? t : null
  }

  const [, y, mo, d, h, mi, sec] = m
  const t = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(sec)
  )
  return Number.isFinite(t) ? t : null
}

const formatOriginalDate = (value: unknown): string => {
  if (!value || typeof value !== 'string') return '-'
  const t = parseOriginalDateToUTC(value)
  if (t == null) return value
  const d = new Date(t)
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  return `${dd}/${mm}/${yyyy}`
}

function CustomersPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname() || '/customers'
  const searchParams = useSearchParams()
  const openCustomerParam = searchParams.get('openCustomer')
  const accountStatusParam = searchParams.get('accountStatus')

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editModalInitialTab, setEditModalInitialTab] = useState<CustomerEditModalTab>('details')
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  /** Desktop (md+): filter grid collapsed by default to save vertical space. */
  const [filtersAccordionOpen, setFiltersAccordionOpen] = useState(false)

  const [tagCatalog, setTagCatalog] = useState<{
    categories: TagCategoryDto[]
    tags: TagDto[]
  } | null>(null)
  const [tagCatalogLoading, setTagCatalogLoading] = useState(false)
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([])
  const [resumeCheckpoint, setResumeCheckpoint] = useState<StoredFollowUpResume | null>(null)

  /** Full-screen follow-up queue (e.g. all FREE) + highlight next call after checkpoint */
  const [followUpQueueOpen, setFollowUpQueueOpen] = useState(false)
  const [followUpQueueRows, setFollowUpQueueRows] = useState<Customer[]>([])
  const [followUpQueueLoading, setFollowUpQueueLoading] = useState(false)
  const [followUpQueueError, setFollowUpQueueError] = useState<string | null>(null)
  const [followUpQueueNextId, setFollowUpQueueNextId] = useState<string | null>(null)
  const [followUpQueueAccountStatus, setFollowUpQueueAccountStatus] = useState<AccountStatusKey>('free')

  const [toasts, setToasts] = useState<Array<{ id: number; type: 'success' | 'error'; text: string }>>([])

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, type, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  // View mode: paginated or show all
  const [viewMode, setViewMode] = useState<'paginated' | 'all'>('paginated')

  /** Top-level page: daily workspace vs sales-journey reporting. */
  const [managementTab, setManagementTab] = useState<'workspace' | 'sales-journey'>('workspace')
  const [salesJourneySubTab, setSalesJourneySubTab] = useState<'overview' | 'directory'>('overview')
  const [salesJourneyRows, setSalesJourneyRows] = useState<Customer[]>([])
  const [salesJourneyLoading, setSalesJourneyLoading] = useState(false)
  const [salesJourneyError, setSalesJourneyError] = useState<string | null>(null)
  const [salesJourneySearch, setSalesJourneySearch] = useState('')
  const [salesJourneyStageFilter, setSalesJourneyStageFilter] = useState<SalesJourneyStageKey | ''>('')

  // Pagination
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('') // immediate input value; search is debounced
  const [genderFilter, setGenderFilter] = useState('')
  const [ethnicityFilter, setEthnicityFilter] = useState('')
  const [ageMinFilter, setAgeMinFilter] = useState<number>(AGE_FILTER_MIN)
  const [ageMaxFilter, setAgeMaxFilter] = useState<number>(AGE_FILTER_MAX)
  const [ageMinDraft, setAgeMinDraft] = useState<number>(AGE_FILTER_MIN)
  const [ageMaxDraft, setAgeMaxDraft] = useState<number>(AGE_FILTER_MAX)
  const [agePresetFilter, setAgePresetFilter] = useState<
    '' | '0-18' | '19-26' | '27-45' | '46-above'
  >('')
  const [birthdayFilter, setBirthdayFilter] = useState<'today' | 'month' | ''>('')
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusKey | ''>('')
  const [profileVerifiedFilter, setProfileVerifiedFilter] = useState<'' | 'yes' | 'no'>('')
  const [directDebitFilter, setDirectDebitFilter] = useState<'' | 'yes' | 'no'>('')
  const [acquisitionSourceFilter, setAcquisitionSourceFilter] = useState<
    '' | 'google_ads' | 'referral' | 'social_media' | 'offline' | 'import' | 'other' | 'unknown'
  >('')
  const [registerMonthFilter, setRegisterMonthFilter] = useState('')
  const [lastPurchaseMonthFilter, setLastPurchaseMonthFilter] = useState('')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const syncFollowUpBookmarkToServer = useCallback(
    async (
      payload: Omit<StoredFollowUpResume, 'updatedAt'> & { updatedAt?: number }
    ): Promise<boolean> => {
      if (!user) return false
      try {
        const res = await fetch('/api/me/follow-up-bookmark', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            customerId: payload.customerId,
            saveName: payload.saveName,
            accountStatusFilter: payload.accountStatusFilter,
            page: payload.page,
            viewMode: payload.viewMode,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.data) return false
        const stored = storedFollowUpResumeFromApi(json.data)
        if (stored && isMountedRef.current) {
          saveFollowUpResume(stored)
          setResumeCheckpoint(stored)
        }
        return Boolean(stored)
      } catch {
        return false
      }
    },
    [user]
  )

  const loadFollowUpBookmarkFromServer = useCallback(async () => {
    if (!user) {
      if (isMountedRef.current) setResumeCheckpoint(null)
      return
    }
    try {
      const res = await fetch('/api/me/follow-up-bookmark', { cache: 'no-store', credentials: 'same-origin' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (isMountedRef.current) setResumeCheckpoint(loadFollowUpResume())
        return
      }
      if (json.data?.customer_id) {
        const stored = storedFollowUpResumeFromApi(json.data)
        if (stored && isMountedRef.current) {
          saveFollowUpResume(stored)
          setResumeCheckpoint(stored)
        }
        return
      }
      const local = loadFollowUpResume()
      if (local) {
        const ok = await syncFollowUpBookmarkToServer(local)
        if (!ok && isMountedRef.current) setResumeCheckpoint(local)
      } else if (isMountedRef.current) {
        setResumeCheckpoint(null)
      }
    } catch {
      if (isMountedRef.current) setResumeCheckpoint(loadFollowUpResume())
    }
  }, [user, syncFollowUpBookmarkToServer])

  const openFollowUpQueueDialog = useCallback(async () => {
    if (!resumeCheckpoint) return
    const status: AccountStatusKey =
      resumeCheckpoint.accountStatusFilter &&
      ACCOUNT_STATUS_QUERY.has(resumeCheckpoint.accountStatusFilter)
        ? (resumeCheckpoint.accountStatusFilter as AccountStatusKey)
        : 'free'

    setFollowUpQueueAccountStatus(status)
    setFollowUpQueueOpen(true)
    setFollowUpQueueLoading(true)
    setFollowUpQueueError(null)
    setFollowUpQueueRows([])
    setFollowUpQueueNextId(null)

    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100000',
        sortBy,
        sortOrder,
        accountStatus: status,
      })
      const res = await fetch(`/api/customers?${params}`, { cache: 'no-store', credentials: 'same-origin' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuatkan senarai')

      const list = Array.isArray(json.data) ? (json.data as Customer[]) : []
      setFollowUpQueueRows(list)

      const lastId = resumeCheckpoint.customerId
      const idx = list.findIndex((c) => c.id === lastId)
      let nextId: string | null = null
      if (list.length === 0) nextId = null
      else if (idx < 0) nextId = list[0].id
      else if (idx + 1 < list.length) nextId = list[idx + 1].id
      else nextId = null
      setFollowUpQueueNextId(nextId)
    } catch (e: unknown) {
      setFollowUpQueueError(e instanceof Error ? e.message : 'Gagal memuatkan')
      setFollowUpQueueRows([])
      setFollowUpQueueNextId(null)
    } finally {
      setFollowUpQueueLoading(false)
    }
  }, [resumeCheckpoint, sortBy, sortOrder])

  const [statusCounts, setStatusCounts] = useState<Record<AccountStatusKey, number>>(EMPTY_STATUS_COUNTS)
  const [statsLoading, setStatsLoading] = useState(false)

  // Malaysia calendar labels for birthday filter (year excluded).
  const malaysiaNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const todayDay = String(malaysiaNow.getUTCDate()).padStart(2, '0')
  const todayMonth = String(malaysiaNow.getUTCMonth() + 1).padStart(2, '0')
  const thisMonthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    month: 'long',
  }).format(new Date())

  // Google Contacts sync
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [isImporting, setIsImporting] = useState(false)
  const [portalLoginUrlCopied, setPortalLoginUrlCopied] = useState(false)
  const isMountedRef = useRef(true)
  const handleEditRef = useRef<(customer: Customer, opts?: { initialTab?: 'details' | 'follow_up' | 'tags' }) => void>(
    () => {}
  )
  const urlOpenDoneRef = useRef<string | null>(null)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (loading) return
    if (!user) {
      setResumeCheckpoint(null)
      return
    }
    void loadFollowUpBookmarkFromServer()
  }, [user?.id, loading, loadFollowUpBookmarkFromServer])

  useEffect(() => {
    urlOpenDoneRef.current = null
  }, [openCustomerParam])

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  const fetchAccountStats = useCallback(async () => {
    if (!user) return
    setStatsLoading(true)
    try {
      const response = await fetch('/api/customers/stats', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load stats')
      if (!isMountedRef.current) return
      if (result.counts && typeof result.counts === 'object') {
        setStatusCounts({ ...EMPTY_STATUS_COUNTS, ...result.counts })
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[customers] stats fetch failed:', e)
      }
    } finally {
      if (isMountedRef.current) setStatsLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      setTagCatalogLoading(true)
      try {
        const response = await fetch('/api/tags', { cache: 'no-store', credentials: 'same-origin' })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || 'Failed to load tag catalog')
        if (!cancelled && Array.isArray(result.categories) && Array.isArray(result.tags)) {
          setTagCatalog({ categories: result.categories, tags: result.tags })
        }
      } catch {
        if (!cancelled) setTagCatalog(null)
      } finally {
        if (!cancelled) setTagCatalogLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  useEffect(() => {
    if (user) {
      fetchCustomers()
    }
  }, [user, page, search, genderFilter, ethnicityFilter, ageMinFilter, ageMaxFilter, birthdayFilter, accountStatusFilter, profileVerifiedFilter, directDebitFilter, acquisitionSourceFilter, registerMonthFilter, lastPurchaseMonthFilter, tagFilterIds, sortBy, sortOrder, viewMode])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const commitAgeRangeWithPreset = (minAge: number, maxAge: number) => {
    const min = Math.min(minAge, maxAge)
    const max = Math.max(minAge, maxAge)
    setAgeMinDraft(min)
    setAgeMaxDraft(max)
    setAgeMinFilter(min)
    setAgeMaxFilter(max)
    setPage(1)
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setSearch('')
    setGenderFilter('')
    setEthnicityFilter('')
    setAgeMinFilter(AGE_FILTER_MIN)
    setAgeMaxFilter(AGE_FILTER_MAX)
    setAgeMinDraft(AGE_FILTER_MIN)
    setAgeMaxDraft(AGE_FILTER_MAX)
    setAgePresetFilter('')
    setBirthdayFilter('')
    setAccountStatusFilter('')
    setProfileVerifiedFilter('')
    setDirectDebitFilter('')
    setAcquisitionSourceFilter('')
    setRegisterMonthFilter('')
    setLastPurchaseMonthFilter('')
    setTagFilterIds([])
    setPage(1)
  }

  // Check Google Contacts connection status
  useEffect(() => {
    if (typeof window === 'undefined' || !user) {
      setIsCheckingConnection(false)
      return
    }
    const checkInterval = setInterval(() => {
      if (window.googleContactsIntegration?.isInitialized()) {
        setIsGoogleConnected(window.googleContactsIntegration.isSignedIn())
        setIsCheckingConnection(false)
        clearInterval(checkInterval)
      }
    }, 500)
    const t = setTimeout(() => {
      clearInterval(checkInterval)
      setIsCheckingConnection(false)
      if (!window.googleContactsIntegration?.isInitialized()) setIsGoogleConnected(false)
    }, 10000)
    return () => {
      clearInterval(checkInterval)
      clearTimeout(t)
    }
  }, [user])

  const handleConnectionChange = useCallback((connected: boolean) => {
    setIsGoogleConnected(connected)
    if (connected) {
      setImportResult({ success: true, message: 'Connected to Google Contacts. You can import customers to Google.' })
    }
  }, [])

  const handleImportResult = useCallback((result: { success: boolean; message: string }) => {
    setImportResult(result)
    setImportProgress({ current: 0, total: 0 })
    if (!result.success) {
      setError(result.message)
    } else {
      runConfetti()
    }
  }, [])

  const handleImportProgress = useCallback((current: number, total: number) => {
    setImportProgress({ current, total })
  }, [])

  const handleCopyPortalLoginUrl = async () => {
    const url = customerPortalLoginUrl(window.location.origin)
    try {
      await navigator.clipboard.writeText(url)
      setPortalLoginUrlCopied(true)
      setImportResult({
        success: true,
        message: `Login link for customer`,
      })
      window.setTimeout(() => setPortalLoginUrlCopied(false), 2000)
    } catch {
      setError('Could not copy login URL. Copy manually: ' + url)
    }
  }

  const handleConnectGoogleContacts = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    if (!window.googleContactsIntegration) {
      setError('Google Contacts not ready. Wait a moment or refresh. Ensure NEXT_PUBLIC_GOOGLE_CONTACTS_CLIENT_ID is set.')
      return
    }
    if (!window.googleContactsIntegration.isInitialized()) {
      setError('Google API is initializing. Please wait and try again.')
      return
    }
    try {
      window.googleContactsIntegration.signIn()
    } catch (err: unknown) {
      setError(`Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }

  const handleImportToGoogleContacts = async () => {
    if (!isGoogleConnected || !window.googleContactsIntegration?.isSignedIn()) {
      setError('Please connect Google Contacts first using "Sync with Google Contacts".')
      return
    }
    setIsImporting(true)
    setError(null)
    setImportResult(null)
    setImportProgress({ current: 0, total: 0 })
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100000',
        sortBy,
        sortOrder,
      })
      const response = await fetch(`/api/customers?${params}`, {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to fetch customers')
      const allCustomers: Customer[] = result.data || []
      if (allCustomers.length === 0) {
        setError('No customers to import. Add customers first.')
        setIsImporting(false)
        return
      }
      const dataToImport = allCustomers.map((c): Record<string, unknown> => ({
        Name: c.name ?? '',
        SenderName: c.sender_name ?? '',
        FirstName: c.first_name ?? '',
        SaveName: c.save_name ?? '',
        DOB: c.dob ?? '',
        Email: c.email ?? '',
        Phone: c.phone ?? '',
      }))
      await window.googleContactsIntegration.importContacts(dataToImport)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Import to Google failed')
    } finally {
      setIsImporting(false)
    }
  }

  const fetchCustomers = async () => {
    setIsLoading(true)
    setError(null)
    // Do not clear `customers` here — empty list + isLoading triggers the full-page spinner.

    try {
      // Birthday filtering must evaluate against the full customer list, not only
      // the current paginated slice.
      const shouldFetchAllForBirthday = birthdayFilter === 'today' || birthdayFilter === 'month'
      const effectiveLimit =
        viewMode === 'all' || shouldFetchAllForBirthday ? '100000' : limit.toString()
      const effectivePage = viewMode === 'all' || shouldFetchAllForBirthday ? '1' : page.toString()

      const params = new URLSearchParams({
        page: effectivePage,
        limit: effectiveLimit,
        sortBy,
        sortOrder,
      })

      if (search) params.append('search', search)
      if (genderFilter) params.append('gender', genderFilter)
      if (ethnicityFilter) params.append('ethnicity', ethnicityFilter)
      if (ageMinFilter > AGE_FILTER_MIN) params.append('ageMin', ageMinFilter.toString())
      if (ageMaxFilter < AGE_FILTER_MAX) params.append('ageMax', ageMaxFilter.toString())
      if (birthdayFilter) params.append('birthday', birthdayFilter)
      if (accountStatusFilter) params.append('accountStatus', accountStatusFilter)
      if (profileVerifiedFilter) params.append('profileVerified', profileVerifiedFilter)
      if (directDebitFilter) params.append('directDebit', directDebitFilter)
      if (acquisitionSourceFilter) params.append('acquisitionSource', acquisitionSourceFilter)
      if (registerMonthFilter) params.append('registerMonth', registerMonthFilter)
      if (lastPurchaseMonthFilter) params.append('lastPurchaseMonth', lastPurchaseMonthFilter)
      if (tagFilterIds.length > 0) params.set('tagIds', tagFilterIds.join(','))

      const response = await fetch(`/api/customers?${params}`, {
        cache: 'no-store',
      })
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch customers')
      }

      if (!isMountedRef.current) return
      setCustomers(result.data || [])
      setTotal(result.pagination?.total || 0)
      setTotalPages(result.pagination?.totalPages || 1)
      void fetchAccountStats()
    } catch (err: any) {
      if (!isMountedRef.current) return
      setError(err.message || 'Failed to load customers')
    } finally {
      if (!isMountedRef.current) return
      setIsLoading(false)
    }
  }

  const fetchSalesJourneySnapshot = useCallback(async () => {
    if (!user) return
    setSalesJourneyLoading(true)
    setSalesJourneyError(null)
    try {
      const params = new URLSearchParams({
        page: '1',
        limit: '100000',
        sortBy: 'updated_at',
        sortOrder: 'desc',
      })
      const response = await fetch(`/api/customers?${params}`, { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Failed to load sales journey data')
      setSalesJourneyRows(Array.isArray(result.data) ? result.data : [])
    } catch (err: unknown) {
      setSalesJourneyError(err instanceof Error ? err.message : 'Failed to load')
      setSalesJourneyRows([])
    } finally {
      setSalesJourneyLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (user && managementTab === 'sales-journey') {
      void fetchSalesJourneySnapshot()
    }
  }, [user, managementTab, fetchSalesJourneySnapshot])

  const salesJourneyStats = useMemo(() => {
    const stages: Record<SalesJourneyStageKey, number> = {
      prospect: 0,
      active_buyer: 0,
      warming: 0,
      at_risk: 0,
      dormant: 0,
      unknown: 0,
    }
    const ranks: Record<BusinessRankBucket, number> = {
      customer: 0,
      dealer: 0,
      priority_dealer: 0,
      master_dealer: 0,
      other: 0,
    }
    for (const c of salesJourneyRows) {
      stages[getSalesJourneyStageKey(c)] += 1
      ranks[getBusinessRankBucket(c.original_data)] += 1
    }
    return { stages, ranks, total: salesJourneyRows.length }
  }, [salesJourneyRows])

  const salesJourneyFilteredRows = useMemo(() => {
    const q = salesJourneySearch.trim().toLowerCase()
    return salesJourneyRows.filter((c) => {
      if (salesJourneyStageFilter && getSalesJourneyStageKey(c) !== salesJourneyStageFilter) return false
      if (!q) return true
      const hay = [c.name, c.pg_code, c.email, c.phone, c.save_name]
        .map((x) => String(x || '').toLowerCase())
        .join(' ')
      return hay.includes(q)
    })
  }, [salesJourneyRows, salesJourneySearch, salesJourneyStageFilter])

  const toggleSort = (field: 'updated_at' | 'register_date' | 'last_purchase_date' | 'pg_code' | 'dob' | 'age') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(field)
      setSortOrder(field === 'pg_code' || field === 'dob' || field === 'age' ? 'asc' : 'desc')
    }
    setPage(1)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(customers.map(c => c.id)))
    } else {
      setSelectedIds(new Set())
    }
  }

  const handleSelectOne = (id: string, checked: boolean) => {
    const newSelected = new Set(selectedIds)
    if (checked) {
      newSelected.add(id)
    } else {
      newSelected.delete(id)
    }
    setSelectedIds(newSelected)
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return

    if (!confirm(`Are you sure you want to delete ${selectedIds.size} customer(s)? This action cannot be undone.`)) {
      return
    }

    setIsDeleting(true)
    try {
      const response = await fetch('/api/customers/bulk', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete customers')
      }

      setSelectedIds(new Set())
      fetchCustomers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete customers')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this customer?')) {
      return
    }

    try {
      const response = await fetch(`/api/customers/${id}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to delete customer')
      }

      fetchCustomers()
    } catch (err: any) {
      setError(err.message || 'Failed to delete customer')
    }
  }

  const handleEdit = (customer: Customer, opts?: { initialTab?: CustomerEditModalTab }) => {
    setIsCreating(false)
    setEditModalInitialTab(opts?.initialTab ?? 'details')
    setIsEditing(customer.id)
  }

  handleEditRef.current = handleEdit

  useEffect(() => {
    if (!user || loading || managementTab !== 'workspace') return
    if (!openCustomerParam) return
    const ac = accountStatusParam || ''
    if (ac && ACCOUNT_STATUS_QUERY.has(ac)) {
      setAccountStatusFilter(ac as AccountStatusKey)
      setPage(1)
    }
  }, [user, loading, managementTab, openCustomerParam, accountStatusParam])

  useEffect(() => {
    if (!user || loading || managementTab !== 'workspace') return
    const oid = openCustomerParam
    if (!oid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(oid)) {
      return
    }
    if (urlOpenDoneRef.current === oid) return
    if (isLoading) return

    const run = async () => {
      const found = customers.find((c) => c.id === oid)
      if (found) {
        handleEditRef.current(found)
        urlOpenDoneRef.current = oid
        return
      }
      try {
        const res = await fetch(`/api/customers/${oid}`, { cache: 'no-store', credentials: 'same-origin' })
        const data = await res.json().catch(() => null)
        if (res.ok && data?.id) {
          handleEditRef.current(data as Customer)
        }
    } finally {
        urlOpenDoneRef.current = oid
      }
    }
    void run()
  }, [user, loading, managementTab, isLoading, customers, openCustomerParam])

  useEffect(() => {
    if (!followUpQueueOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [followUpQueueOpen])

  useLayoutEffect(() => {
    if (!followUpQueueOpen || followUpQueueLoading) return
    const id = followUpQueueNextId
    if (!id) return
    const el = document.getElementById(`follow-up-queue-row-${id}`)
    if (el) {
      requestAnimationFrame(() => {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      })
    }
  }, [followUpQueueOpen, followUpQueueLoading, followUpQueueNextId, followUpQueueRows])

  const handleExport = async () => {
    try {
      const response = await fetch('/api/excel/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: customers,
          originalHeaders: [],
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to generate Excel file')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `customers_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.message || 'Failed to export')
    }
  }

  // Full-page loading only on initial load (no data yet). Sorting/filtering refetches in background.
  if (loading || (isLoading && customers.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="pointer-events-none fixed right-4 top-4 z-[100] space-y-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto min-w-[260px] max-w-sm rounded-xl border px-4 py-3 text-sm shadow-lg ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-red-200 bg-red-50 text-red-900'
            }`}
          >
            {toast.text}
          </div>
        ))}
      </div>

      {followUpQueueOpen && (
        <div
          className="fixed inset-0 z-[95] flex flex-col bg-white"
          role="dialog"
          aria-modal="true"
          aria-labelledby="follow-up-queue-title"
        >
          <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 id="follow-up-queue-title" className="text-lg font-semibold text-slate-900">
                Senarai follow-up — {accountStatusQueueTitle(followUpQueueAccountStatus)}
              </h2>
              <p className="text-xs text-slate-600">
                Isihan sama seperti jadual utama: <strong>{sortBy}</strong> ({sortOrder}). Baris hijau ={' '}
                <strong>seterusnya untuk dihubungi</strong>. Baris kuning = terakhir dibuka (checkpoint).
              </p>
              <p className="text-[11px] leading-snug text-slate-500">
                Senarai ini kekal dibuka di belakang: klik baris untuk buka pelanggan (tab Follow-up). Tutup borang
                pelanggan untuk kembali ke senarai dan pilih seterusnya — hanya tekan &quot;Tutup&quot; di atas untuk
                keluar sepenuhnya.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFollowUpQueueOpen(false)}
              className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-100"
            >
              Tutup
            </button>
          </header>

          {followUpQueueLoading && (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <svg
                  className="mx-auto h-8 w-8 animate-spin text-blue-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <p className="mt-3 text-sm text-slate-600">Memuatkan senarai…</p>
              </div>
            </div>
          )}

          {!followUpQueueLoading && followUpQueueError && (
            <div className="m-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {followUpQueueError}
            </div>
          )}

          {!followUpQueueLoading && !followUpQueueError && (
            <>
              {(() => {
                const ckIdx = resumeCheckpoint
                  ? followUpQueueRows.findIndex((c) => c.id === resumeCheckpoint.customerId)
                  : -1
                const atEnd =
                  followUpQueueRows.length > 0 &&
                  followUpQueueNextId === null &&
                  ckIdx >= 0 &&
                  ckIdx === followUpQueueRows.length - 1
                const notInList =
                  followUpQueueRows.length > 0 &&
                  ckIdx < 0 &&
                  resumeCheckpoint != null
                return (
                  <>
                    {atEnd && (
                      <div className="mx-4 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        Anda sudah di <strong>pelanggan terakhir</strong> dalam senarai (ikut susunan semasa). Tiada
                        &quot;seterusnya&quot; automatik — pilih baris lain atau tukar penapis / isihan di jadual utama.
                      </div>
                    )}
                    {notInList && (
                      <div className="mx-4 mt-3 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                        Checkpoint tidak dijumpai dalam senarai ini — disyorkan bermula dengan pelanggan pertama
                        (diserlahkan hijau).
                      </div>
                    )}
                  </>
                )
              })()}
              <div className="min-h-0 flex-1 overflow-auto">
                {followUpQueueRows.length === 0 ? (
                  <p className="p-6 text-sm text-slate-600">Tiada rekod untuk penapis ini.</p>
                ) : (
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-slate-100">
                      <tr>
                        <th className="px-3 py-2 font-semibold text-slate-700">Save name</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">PG code</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Name</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Phone</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {followUpQueueRows.map((c) => {
                        const isNext = followUpQueueNextId === c.id
                        const isCheckpoint = resumeCheckpoint?.customerId === c.id
                        return (
                          <tr
                            key={c.id}
                            id={isNext ? `follow-up-queue-row-${c.id}` : undefined}
                            onClick={() => {
                              handleEdit(c, { initialTab: 'follow_up' })
                            }}
                            className={`cursor-pointer transition-colors ${
                              isNext
                                ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-500'
                                : isCheckpoint
                                  ? 'bg-amber-50/90'
                                  : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="px-3 py-2 font-medium text-slate-900">{c.save_name || '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{c.pg_code || '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{c.name || '—'}</td>
                            <td className="px-3 py-2 text-slate-800">{c.phone || '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-600">
                              {isNext ? (
                                <span className="font-semibold text-emerald-800">Seterusnya</span>
                              ) : isCheckpoint ? (
                                <span className="font-medium text-amber-900">Terakhir dibuka</span>
                              ) : (
                                getAccountStatusLabel(c)
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              {!followUpQueueLoading && followUpQueueRows.length > 0 && (
                <div className="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-2 text-center text-xs text-slate-600">
                  {followUpQueueRows.length} pelanggan · ketik baris untuk buka borang edit
                </div>
              )}
            </>
          )}
        </div>
      )}

      <GoogleContactsIntegration
        onConnectionChange={handleConnectionChange}
        onImportResult={handleImportResult}
        onImportProgress={handleImportProgress}
      />
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">

            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all duration-200"
            >
              <div className="flex flex-row items-center justify-start gap-3">

                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Dashboard
              </div>

            </Link>


            <UserProfileMenu />

            {/* <h1 className="text-2xl font-semibold text-slate-900">Customer Management</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Total: {total} customer(s) | Page {page} of {totalPages}
                </p> */}

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-lg font-semibold text-slate-900 ">Customer management</h1>
          <div
            role="tablist"
            aria-label="Customer management sections"
            className="flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto"
          >
            <button
              type="button"
              role="tab"
              aria-selected={managementTab === 'workspace'}
              onClick={() => setManagementTab('workspace')}
              className={`min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none sm:min-h-0 ${
                managementTab === 'workspace'
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              Workspace
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={managementTab === 'sales-journey'}
              onClick={() => setManagementTab('sales-journey')}
              className={`min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none sm:min-h-0 ${
                managementTab === 'sales-journey'
                  ? 'bg-slate-900 text-white shadow'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              Sales journey
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
        {managementTab === 'workspace' && (
        <motion.div
          key="customer-mgmt-workspace"
          role="tabpanel"
          aria-label="Workspace"
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ type: 'tween', duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        >
        {resumeCheckpoint && (
          <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900/90">
                  Checkpoint follow-up
                </p>
                <p className="mt-1 text-sm text-amber-950">
                  Checkpoint: <strong className="break-words">{resumeCheckpoint.saveName}</strong>
                  {resumeCheckpoint.accountStatusFilter ? (
                    <span className="text-amber-900/90">
                      {' '}
                      · penapis: <strong>{resumeCheckpoint.accountStatusFilter}</strong>
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-amber-800/90">
                  Dikemas kini apabila anda simpan log follow-up dengan saluran <strong>Panggilan</strong>. Tekan
                  &quot;Sambung&quot; atau simpan pautan sebagai bookmark.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void openFollowUpQueueDialog()}
                  className="rounded-xl bg-amber-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-700"
                >
                  Sambung
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const href = buildFollowUpResumeUrl({
                      origin: window.location.origin,
                      pathname,
                      customerId: resumeCheckpoint.customerId,
                      accountStatusFilter: resumeCheckpoint.accountStatusFilter,
                    })
                    try {
                      await navigator.clipboard.writeText(href)
                      pushToast('success', 'Pautan disalin — simpan sebagai bookmark.')
                    } catch {
                      pushToast('error', 'Gagal salin pautan.')
                    }
                  }}
                  className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100/80"
                >
                  Salin pautan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    clearFollowUpResume()
                    setResumeCheckpoint(null)
                    if (user) {
                      void fetch('/api/me/follow-up-bookmark', {
                        method: 'DELETE',
                        credentials: 'same-origin',
                      }).catch(() => {})
                    }
                    pushToast('success', 'Checkpoint dikosongkan.')
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Kosongkan
                </button>
              </div>
            </div>
          </div>
        )}
        {/* Filters & Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className="md:hidden w-full mb-4 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-medium flex items-center justify-between"
            aria-expanded={mobileFiltersOpen}
            aria-controls="customers-filters-actions-panel"
          >
            <span>Filters & actions</span>
            <svg
              className={`h-5 w-5 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div
            id="customers-filters-actions-panel"
            className={`${mobileFiltersOpen ? 'block' : 'hidden'} md:block`}
          >
            <button
              type="button"
              onClick={() => setFiltersAccordionOpen((prev) => !prev)}
              className="mb-4 hidden w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-100 md:flex"
              aria-expanded={filtersAccordionOpen}
              aria-controls="customers-filters-grid"
            >
              <span>Filters</span>
              <svg
                className={`h-5 w-5 shrink-0 text-slate-600 transition-transform ${filtersAccordionOpen ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            <div
              id="customers-filters-grid"
              className={`${mobileFiltersOpen ? 'block' : 'max-md:hidden'} ${filtersAccordionOpen ? 'md:block' : 'md:hidden'}`}
          >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Search */}
            <div className="md:col-span-2 flex gap-2">
              <input
                type="text"
                placeholder="Search by name, email, phone, or PG code..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                className="flex-1 px-4 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={handleSearch}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium whitespace-nowrap"
              >
                Search
              </button>
            </div>

            {/* Gender Filter */}
            <select
              value={genderFilter}
              onChange={(e) => {
                setGenderFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            {/* Ethnicity Filter */}
            <select
              value={ethnicityFilter}
              onChange={(e) => {
                setEthnicityFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Ethnicities</option>
              <option value="Malay">Malay</option>
              <option value="Chinese">Chinese</option>
              <option value="Indian">Indian</option>
              <option value="Other">Other</option>
            </select>

            {/* Age Filter */}
            <select
              value={agePresetFilter}
                  onChange={(e) => {
                const v = e.target.value as '' | '0-18' | '19-26' | '27-45' | '46-above'
                setAgePresetFilter(v)
                if (v === '') {
                  commitAgeRangeWithPreset(AGE_FILTER_MIN, AGE_FILTER_MAX)
                  return
                }
                if (v === '0-18') commitAgeRangeWithPreset(0, 18)
                else if (v === '19-26') commitAgeRangeWithPreset(19, 26)
                else if (v === '27-45') commitAgeRangeWithPreset(27, 45)
                else if (v === '46-above') commitAgeRangeWithPreset(46, AGE_FILTER_MAX)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Ages</option>
              <option value="0-18">0-18 (junior account)</option>
              <option value="19-26">19-26 (anak muda)</option>
              <option value="27-45">27-45</option>
              <option value="46-above">46-above (vetren)</option>
            </select>

            {/* Birthday Filter */}
            <select
              value={birthdayFilter}
              onChange={(e) => {
                setBirthdayFilter(e.target.value as 'today' | 'month' | '')
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Birthdays</option>
              <option value="today">Born Today ({todayDay}/{todayMonth})</option>
              <option value="month">Born This Month ({thisMonthName})</option>
            </select>

            {/* Account Status Filter */}
            <select
              value={accountStatusFilter}
              onChange={(e) => {
                setAccountStatusFilter((e.target.value || '') as AccountStatusKey | '')
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Account Status</option>
              <option value="free">Free account (daftar, tak beli lebih 12 mo, ada PG)</option>
              <option value="freeze">Freeze account (daftar, tak beli 3–12 mo, ada PG)</option>
              <option value="inactive">Inactive account (daftar, belian terakhir bulan lepas)</option>
              <option value="temporary">Temporary account (daftar, tiada PG code, tak beli)</option>
              <option value="active">Active account (monthly buyer dalam bulan semasa)</option>
              <option value="unknown">Unknown</option>
            </select>

            <select
              value={profileVerifiedFilter}
              onChange={(e) => {
                setProfileVerifiedFilter((e.target.value || '') as '' | 'yes' | 'no')
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Verified</option>
              <option value="yes">Verified: Yes</option>
              <option value="no">Verified: No</option>
            </select>

            <select
              value={directDebitFilter}
              onChange={(e) => {
                setDirectDebitFilter((e.target.value || '') as '' | 'yes' | 'no')
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Direct Debit (all)</option>
              <option value="yes">Direct Debit: Yes</option>
              <option value="no">Direct Debit: No</option>
            </select>

            <select
              value={acquisitionSourceFilter}
              onChange={(e) => {
                setAcquisitionSourceFilter(
                  (e.target.value || '') as
                    | ''
                    | 'google_ads'
                    | 'referral'
                    | 'social_media'
                    | 'offline'
                    | 'import'
                    | 'other'
                    | 'unknown'
                )
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Source (all)</option>
              <option value="google_ads">Google Ads</option>
              <option value="referral">Referral / Network</option>
              <option value="social_media">Social Media</option>
              <option value="offline">Offline / Event</option>
              <option value="import">Import / Sync</option>
              <option value="other">Other</option>
              <option value="unknown">Unknown</option>
            </select>

            <select
              value={registerMonthFilter}
              onChange={(e) => {
                setRegisterMonthFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Register month (all)</option>
              <option value="1">Jan</option>
              <option value="2">Feb</option>
              <option value="3">Mar</option>
              <option value="4">Apr</option>
              <option value="5">May</option>
              <option value="6">Jun</option>
              <option value="7">Jul</option>
              <option value="8">Aug</option>
              <option value="9">Sep</option>
              <option value="10">Oct</option>
              <option value="11">Nov</option>
              <option value="12">Dec</option>
            </select>

            <select
              value={lastPurchaseMonthFilter}
              onChange={(e) => {
                setLastPurchaseMonthFilter(e.target.value)
                setPage(1)
              }}
              className="px-4 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Last purchase month (all)</option>
              <option value="1">Jan</option>
              <option value="2">Feb</option>
              <option value="3">Mar</option>
              <option value="4">Apr</option>
              <option value="5">May</option>
              <option value="6">Jun</option>
              <option value="7">Jul</option>
              <option value="8">Aug</option>
              <option value="9">Sep</option>
              <option value="10">Oct</option>
              <option value="11">Nov</option>
              <option value="12">Dec</option>
            </select>

            <div className="md:col-span-2">
              <CrmTagMultiSelect
                categories={tagCatalog?.categories ?? []}
                tags={tagCatalog?.tags ?? []}
                selectedIds={tagFilterIds}
                onChange={(ids) => {
                  setTagFilterIds(ids)
                  setPage(1)
                }}
                disabled={!tagCatalog || tagCatalog.tags.length === 0 || tagCatalogLoading}
              />
            </div>

            {/* View mode: paginated vs all */}
            <label className="flex items-center gap-2 px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={viewMode === 'all'}
                onChange={(e) => {
                  setViewMode(e.target.checked ? 'all' : 'paginated')
                  setPage(1)
                }}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
              />
              <span className="text-sm font-medium whitespace-nowrap">Show all (no pagination)</span>
            </label>

            {/* Clear filters */}
            <button
              type="button"
              onClick={handleClearFilters}
              className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors font-medium whitespace-nowrap"
            >
              Clear
            </button>
          </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setIsEditing(null)
                setEditModalInitialTab('details')
                setIsCreating(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Customer
            </button>

            <button
              type="button"
              onClick={() => void handleCopyPortalLoginUrl()}
              title={`Copy ${PORTAL_BRAND} customer sign-in link`}
              className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 transition-colors flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              {portalLoginUrlCopied ? 'Copied!' : 'Copy login URL'}
            </button>

            {selectedIds.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-xl hover:bg-red-700 disabled:bg-slate-400 transition-colors flex items-center gap-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete Selected ({selectedIds.size})
              </button>
            )}

            <button
              onClick={handleExport}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Export to Excel
            </button>

            <button
              type="button"
              onClick={handleConnectGoogleContacts}
              disabled={isCheckingConnection}
              className="px-4 py-2 bg-slate-700 text-white text-sm font-medium rounded-xl hover:bg-slate-800 disabled:opacity-70 transition-colors flex items-center gap-2"
            >
              {isGoogleConnected ? (
                <>
                  <svg className="h-5 w-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Google Connected
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  {isCheckingConnection ? 'Checking…' : 'Sync with Google Contacts'}
                </>
              )}
            </button>
            {isGoogleConnected && (
              <button
                type="button"
                onClick={handleImportToGoogleContacts}
                disabled={isImporting}
                className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded-xl hover:bg-amber-700 disabled:opacity-70 transition-colors flex items-center gap-2"
              >
                {isImporting ? (
                  <>
                    <svg className="animate-spin h-5 w-5 shrink-0" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Importing…
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Import all to Google Contacts
                  </>
                )}
              </button>
            )}
          </div>
          {(isImporting || importProgress.total > 0) && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-slate-600 mb-1">
                <span>Importing to Google Contacts…</span>
                <span>{importProgress.total > 0 ? `${importProgress.current} / ${importProgress.total}` : 'Preparing…'}</span>
              </div>
              <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full transition-all duration-300 ease-out"
                  style={{
                    width: importProgress.total > 0 ? `${(100 * importProgress.current) / importProgress.total}%` : '0%',
                  }}
                />
              </div>
            </div>
          )}
          {importResult?.message && (
            <p className={`mt-3 text-sm ${importResult.success ? 'text-green-700' : 'text-amber-700'}`}>
              {importResult.message}
            </p>
          )}
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        <CustomerEditModalShell
          open={Boolean(isCreating || isEditing)}
          isCreating={isCreating}
          customerId={isEditing}
          initialCustomer={isCreating ? {} : null}
          initialTab={editModalInitialTab}
          overlayZIndexClassName={followUpQueueOpen ? 'z-[1300]' : undefined}
          followUpResumeContext={
            isEditing
              ? {
                  accountStatusFilter: accountStatusFilter || '',
                  page,
                  viewMode,
                }
              : null
          }
          onResumeSynced={(stored) => {
            setResumeCheckpoint(stored)
          }}
          onClose={() => {
                      setIsCreating(false)
                      setIsEditing(null)
            setEditModalInitialTab('details')
          }}
          onSaved={() => {
            void fetchCustomers()
          }}
        />


        {/* Account status counts (all customers in your database) */}
        <div className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">

            {/* // suport theme color */}
            <h2 className="text-sm font-semibold text-slate-800 dark:text-white">Account status</h2>
            <div className="flex items-center gap-3 text-xs text-slate-500">
              {statsLoading ? (
                <span className="inline-flex items-center gap-1.5 dark:text-white">
                  <svg className="animate-spin h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Updating counts…
                </span>
              ) : null}
              <span className="dark:text-white">
                Total{' '}
                <strong className="text-slate-700 dark:text-white">
                  {Object.values(statusCounts).reduce((a, b) => a + b, 0)}
                </strong>
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {(
              [
                {
                  key: 'active' as const,
                  label: 'Active',
                  sub: 'Buyer this month',
                  className: 'border-green-200 bg-green-50/80 text-green-900',
                },
                {
                  key: 'inactive' as const,
                  label: 'Inactive',
                  sub: 'Recent Buyer, not this month',
                  className: 'border-red-200 bg-red-50/80 text-red-900',
                },
                {
                  key: 'freeze' as const,
                  label: 'Freeze',
                  sub: 'No Sales within 3-11 months',
                  className: 'border-orange-200 bg-orange-50/80 text-orange-950',
                },
                {
                  key: 'free' as const,
                  label: 'Free',
                  sub: 'No Sales within a year',
                  className: 'border-amber-200 bg-amber-50/80 text-amber-950',
                },
                {
                  key: 'temporary' as const,
                  label: 'Temporary',
                  sub: 'No PG code',
                  className: 'border-violet-200 bg-violet-50/80 text-violet-950',
                },
                {
                  key: 'unknown' as const,
                  label: 'Unknown',
                  sub: 'Needs data',
                  className: 'border-slate-200 bg-slate-50 text-slate-800',
                },
              ] as const
            ).map(({ key, label, sub, className }) => {
              const selected = accountStatusFilter === key
              return (
                <button
                key={key}
                  type="button"
                  onClick={() => {
                    setAccountStatusFilter((prev) => (prev === key ? '' : key))
                    setPage(1)
                  }}
                  title={selected ? `Clear ${label} filter` : `Show only ${label} customers`}
                  aria-pressed={selected}
                  className={`rounded-2xl border px-4 py-3 shadow-sm text-left w-full transition-all duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${className} ${
                    selected
                      ? 'ring-2 ring-blue-600 ring-offset-2 ring-offset-slate-50 dark:ring-offset-slate-900 shadow-md scale-[1.01]'
                      : 'hover:scale-[1.02] hover:shadow-md active:scale-[0.99]'
                  }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{statusCounts[key]}</p>
                <p className="mt-0.5 text-[10px] opacity-80 leading-tight">{sub}</p>
                </button>
              )
            })}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-white">
            Click a card to filter the table (click again to clear). Counts reflect all saved customers; they refresh
            after create, edit, or delete.
          </p>
        </div>

        {/* Customers Table */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-100 border-b-2 border-slate-300">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <input
                      type="checkbox"
                      checked={selectedIds.size > 0 && selectedIds.size === customers.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded cursor-pointer"
                    />
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Sender Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Save Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('pg_code')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded uppercase tracking-wider"
                      title={sortOrder === 'desc' ? 'Z–A / high–low (click for A–Z)' : 'A–Z / low–high (click for Z–A)'}
                    >
                      PG Code
                      {sortBy === 'pg_code' &&
                        (sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        ))}
                    </button>
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Gender</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Ethnicity</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('age')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title={
                        sortOrder === 'desc' ? 'Oldest age first (click for youngest)' : 'Youngest age first (click for oldest)'
                      }
                    >
                      Age
                      {sortBy === 'age' && (
                        sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        )
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('dob')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title={sortOrder === 'desc' ? 'Newest DOB first (click for oldest)' : 'Oldest DOB first (click for newest)'}
                    >
                      Date of Birth
                      {sortBy === 'dob' && (
                        sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        )
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Married</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Friend</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Verified</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Direct Debit</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Source</th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Status</th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('register_date')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    >
                      Register Date
                      {sortBy === 'register_date' && (
                        sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        )
                      )}
                    </button>
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('last_purchase_date')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                    >
                      Last Purchase
                      {sortBy === 'last_purchase_date' && (
                        sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        )
                      )}
                    </button>
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">
                    <button
                      type="button"
                      onClick={() => toggleSort('updated_at')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title={sortOrder === 'desc' ? 'Newest first (click for oldest)' : 'Oldest first (click for newest)'}
                    >
                      Imported at
                      {sortBy === 'updated_at' && (
                        sortOrder === 'desc' ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                        )
                      )}
                    </button>
                  </th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={21} className="px-4 py-8 text-center text-slate-500">
                      {isLoading ? 'Loading...' : 'No customers found'}
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => {
                    const accountKey = getAccountStatusKey(customer)
                    return (
                      <tr
                        key={customer.id}
                        onClick={() => handleEdit(customer)}
                        className={`cursor-pointer transition-colors ${ACCOUNT_STATUS_ROW_CLASSES[accountKey]}`}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(customer.id)}
                            onChange={(e) => handleSelectOne(customer.id, e.target.checked)}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded cursor-pointer"
                          />
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-800">{customer.sender_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800 font-medium">{customer.save_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{customer.pg_code || '-'}</td>

                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{customer.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{customer.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{customer.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{customer.gender || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">{customer.ethnicity || '-'}</td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {displayCustomerAge(customer.dob, customer.age) ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {customer.dob
                            ? (() => {
                              const d = new Date(customer.dob)
                              const dd = String(d.getUTCDate()).padStart(2, '0')
                              const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
                              const yyyy = d.getUTCFullYear()
                              return `${dd}/${mm}/${yyyy}`
                            })()
                            : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {customer.is_married === true ? 'Yes' : customer.is_married === false ? 'No' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {customer.is_friend === true ? 'Yes' : customer.is_friend === false ? 'No' : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {parseProfileVerified(customer.original_data) === true
                            ? 'Yes'
                            : parseProfileVerified(customer.original_data) === false
                              ? 'No'
                              : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {(() => {
                            const directDebit = parseDirectDebitSubscription(customer.original_data)
                            if (directDebit === true) {
                              return (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Yes
                                </span>
                              )
                            }
                            if (directDebit === false) {
                              return (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                                  No
                                </span>
                              )
                            }
                            return (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                                -
                              </span>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {(() => {
                            const source = deriveCustomerSource(
                              customer.original_data,
                              customer.segment_attributes
                            )
                            const labelMap: Record<string, string> = {
                              google_ads: 'Google Ads',
                              referral: 'Referral',
                              social_media: 'Social Media',
                              offline: 'Offline',
                              import: 'Import',
                              other: 'Other',
                              unknown: 'Unknown',
                            }
                            return (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                                {labelMap[source] || 'Unknown'}
                              </span>
                            )
                          })()}
                        </td>

                        <td className="px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${accountKey === 'inactive'
                              ? 'bg-red-50 text-red-700 border border-red-100'
                              : accountKey === 'free'
                                ? 'bg-amber-50 text-amber-800 border border-amber-100'
                                : accountKey === 'active'
                                  ? 'bg-green-50 text-green-700 border border-green-100'
                                  : accountKey === 'temporary'
                                    ? 'bg-violet-50 text-violet-800 border border-violet-100'
                                    : accountKey === 'freeze'
                                      ? 'bg-orange-50 text-orange-800 border border-orange-100'
                                      : 'bg-slate-50 text-slate-700 border border-slate-200'
                              }`}
                          >
                            {accountKey === 'inactive'
                              ? 'Inactive'
                              : accountKey === 'free'
                                ? 'Free account'
                                : accountKey === 'active'
                                  ? 'Active'
                                  : accountKey === 'temporary'
                                    ? 'Temporary'
                                    : accountKey === 'freeze'
                                      ? 'Freeze'
                                      : '-'}
                          </span>
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-800">
                          {customer.original_data?.['Date Register']
                            ? formatOriginalDate(customer.original_data?.['Date Register'])
                            : customer.created_at
                              ? (() => {
                                const d = new Date(customer.created_at)
                                const dd = String(d.getUTCDate()).padStart(2, '0')
                                const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
                                const yyyy = d.getUTCFullYear()
                                return `${dd}/${mm}/${yyyy}`
                              })()
                              : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-800">
                          {formatLastPurchaseDisplayForUi(customer)}
                        </td>

                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">
                          {(customer.updated_at || customer.created_at)
                            ? new Date(customer.updated_at || customer.created_at).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            })
                            : '-'}
                        </td>

                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleEdit(customer)
                              }}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                              title="Edit"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDelete(customer.id)
                              }}
                              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                              title="Delete"
                            >
                              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination or "Showing all" */}
          {viewMode === 'all' ? (
            <div className="px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
              Showing all {total} customer{total !== 1 ? 's' : ''}
            </div>
          ) : totalPages > 1 ? (
            <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-slate-700">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          ) : null}
        </div>
        </motion.div>
        )}

        {managementTab === 'sales-journey' && (
          <motion.div
            key="customer-mgmt-sales-journey"
            role="tabpanel"
            aria-label="Sales journey"
            className="space-y-6"
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: 'tween', duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              role="tablist"
              aria-label="Sales journey views"
              className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex w-full rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto">
                <button
                  type="button"
                  role="tab"
                  aria-selected={salesJourneySubTab === 'overview'}
                  onClick={() => setSalesJourneySubTab('overview')}
                  className={`min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none sm:min-h-0 ${
                    salesJourneySubTab === 'overview'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Report overview
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={salesJourneySubTab === 'directory'}
                  onClick={() => setSalesJourneySubTab('directory')}
                  className={`min-h-[44px] flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors sm:flex-none sm:min-h-0 ${
                    salesJourneySubTab === 'directory'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Journey directory
                </button>
              </div>
              <button
                type="button"
                onClick={() => void fetchSalesJourneySnapshot()}
                disabled={salesJourneyLoading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                {salesJourneyLoading ? 'Refreshing…' : 'Refresh data'}
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Journey stages are derived from account status (PG code + purchase behaviour). Rank comes from
              the <strong>Rank</strong> field. Overview loads up to all saved customers for your account.
            </p>

            {salesJourneyError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {salesJourneyError}
              </div>
            )}

            {salesJourneySubTab === 'overview' && (
              <div className="space-y-8">
                {salesJourneyLoading && salesJourneyRows.length === 0 ? (
                  <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16">
                    <div className="text-center">
                      <svg
                        className="mx-auto h-8 w-8 animate-spin text-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <p className="mt-3 text-sm text-slate-900">Loading journey overview…</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <section>
                      <h2 className="mb-3 text-sm font-semibold text-slate-300">Pipeline (journey stage)</h2>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {SALES_JOURNEY_STAGE_ORDER.map((stage) => {
                          const n = salesJourneyStats.stages[stage]
                          const pct =
                            salesJourneyStats.total > 0 ? Math.round((100 * n) / salesJourneyStats.total) : 0
                          return (
                            <div
                              key={stage}
                              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {getSalesJourneyStageLabel(stage)}
                              </p>
                              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{n}</p>
                              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-blue-500 transition-all"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="mt-1 text-xs text-slate-900">{pct}% of total</p>
                            </div>
                          )
                        })}
                      </div>
                      <p className="mt-2 text-xs text-slate-300">
                        Total contacts in snapshot: <strong>{salesJourneyStats.total}</strong>
                      </p>
                    </section>

                    <section>
                      <h2 className="mb-1 text-sm font-semibold text-slate-300">By rank (from Rank field)</h2>
                      <p className="mb-4 text-xs text-slate-300">
                        Funnel width follows each tier’s count (widest = largest bucket). Tiers link Customer →
                        Dealer → Priority → Master → Other.
                      </p>

                      <div className="mb-6 rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 via-white to-indigo-50/30 p-4 shadow-inner sm:p-6">
                        {(() => {
                          const totalRank = salesJourneyStats.total
                          const counts = RANK_OVERVIEW_BUCKETS.map((b) => salesJourneyStats.ranks[b])
                          const maxC = Math.max(...counts, 1)
                          const VW = 420
                          const VH = 216
                          const cx = VW / 2
                          const padX = 32
                          const maxHalf = cx - padX
                          const minH0 = 5
                          const minH1 = 14
                          const halfW = (n: number) => {
                            if (n <= 0) return minH0
                            return minH1 + (maxHalf - minH1) * (n / maxC)
                          }
                          const steps = RANK_OVERVIEW_BUCKETS.length
                          const yTop = 10
                          const yBot = VH - 6
                          const segH = (yBot - yTop) / steps
                          const ys = Array.from({ length: steps + 1 }, (_, j) => yTop + j * segH)

                          const polys: { d: string; fill: string; i: number }[] = []
                          for (let i = 0; i < steps; i++) {
                            const yt = ys[i]
                            const yb = ys[i + 1]
                            const ht = halfW(counts[i])
                            const hb =
                              i < steps - 1
                                ? halfW(counts[i + 1])
                                : Math.max(minH0, halfW(counts[i]) * 0.28)
                            const fill = RANK_FUNNEL_SEGMENT_FILLS[i] ?? '#64748b'
                            const d = `M ${cx - ht} ${yt} L ${cx + ht} ${yt} L ${cx + hb} ${yb} L ${cx - hb} ${yb} Z`
                            polys.push({ d, fill, i })
                          }

                          return (
                            <svg
                              viewBox={`0 0 ${VW} ${VH + 2}`}
                              className="mx-auto h-auto w-full max-w-lg overflow-visible"
                              role="img"
                              aria-label="Business rank funnel: tier width reflects customer counts in each rank bucket."
                            >
                              {polys.map(({ d, fill, i }) => (
                                <path
                                  key={i}
                                  d={d}
                                  fill={fill}
                                  fillOpacity={0.92}
                                  stroke="white"
                                  strokeWidth={1.25}
                                  strokeOpacity={0.55}
                                />
                              ))}
                              {RANK_OVERVIEW_BUCKETS.map((bucket, i) => {
                                const n = salesJourneyStats.ranks[bucket]
                                const pct = totalRank > 0 ? Math.round((100 * n) / totalRank) : 0
                                const ym = ys[i] + segH / 2
                                const dark = i >= 3
                                const fill = dark ? '#f8fafc' : '#0f172a'
                                return (
                                  <g key={bucket} className="pointer-events-none select-none">
                                    <text
                                      x={cx}
                                      y={ym - 2}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={fill}
                                      fontSize={n > 9999 ? 11 : 13}
                                      fontWeight={700}
                                      style={{ fontFamily: 'system-ui, sans-serif' }}
                                    >
                                      {n.toLocaleString()}
                                    </text>
                                    <text
                                      x={cx}
                                      y={ym + 12}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill={fill}
                                      fontSize={10}
                                      fontWeight={600}
                                      opacity={0.88}
                                      style={{ fontFamily: 'system-ui, sans-serif' }}
                                    >
                                      {pct}%
                                    </text>
                                  </g>
                                )
                              })}
                            </svg>
                          )
                        })()}
                      </div>

                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Breakdown</h3>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        {RANK_OVERVIEW_BUCKETS.map((bucket) => {
                          const n = salesJourneyStats.ranks[bucket]
                          const pct =
                            salesJourneyStats.total > 0 ? Math.round((100 * n) / salesJourneyStats.total) : 0
                          return (
                            <div
                              key={bucket}
                              className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                            >
                              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                {getBusinessRankBucketLabel(bucket)}
                              </p>
                              <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{n}</p>
                              <p className="mt-1 text-xs text-slate-500">{pct}%</p>
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  </>
                )}
              </div>
            )}

            {salesJourneySubTab === 'directory' && (
              <div className="rounded-2xl border border-slate-200 bg-white shadow-xl">
                <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Search</label>
                    <input
                      type="search"
                      value={salesJourneySearch}
                      onChange={(e) => setSalesJourneySearch(e.target.value)}
                      placeholder="Name, save name, PG code, email, phone…"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:w-56">
                    <label className="mb-1 block text-xs font-medium text-slate-600">Journey stage</label>
                    <select
                      value={salesJourneyStageFilter}
                      onChange={(e) =>
                        setSalesJourneyStageFilter((e.target.value || '') as SalesJourneyStageKey | '')
                      }
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">All stages</option>
                      {SALES_JOURNEY_STAGE_ORDER.map((s) => (
                        <option key={s} value={s}>
                          {getSalesJourneyStageLabel(s)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          PG code
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Rank (raw)
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Rank (group)
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Account status
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Journey stage
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wide text-slate-700">
                          Last purchase
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {salesJourneyLoading && salesJourneyRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                            Loading…
                          </td>
                        </tr>
                      ) : salesJourneyFilteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                            No rows match your filters.
                          </td>
                        </tr>
                      ) : (
                        salesJourneyFilteredRows.map((row) => {
                          const stage = getSalesJourneyStageKey(row)
                          const rankBucket = getBusinessRankBucket(row.original_data)
                          const rawRank =
                            row.original_data &&
                            typeof row.original_data === 'object' &&
                            !Array.isArray(row.original_data)
                              ? String((row.original_data as Record<string, unknown>)['Rank'] ?? '')
                              : ''
                          return (
                            <tr
                              key={row.id}
                              className="cursor-pointer hover:bg-slate-50"
                              onClick={() => handleEdit(row)}
                            >
                              <td className="px-4 py-2 text-sm font-medium text-slate-900">
                                {row.name || row.save_name || '—'}
                              </td>
                              <td className="px-4 py-2 text-sm text-slate-700">{row.pg_code || '—'}</td>
                              <td className="max-w-[140px] truncate px-4 py-2 text-sm text-slate-600" title={rawRank}>
                                {rawRank.trim() || '—'}
                              </td>
                              <td className="px-4 py-2 text-sm text-slate-700">
                                {getBusinessRankBucketLabel(rankBucket)}
                              </td>
                              <td className="px-4 py-2 text-sm text-slate-700">{getAccountStatusLabel(row)}</td>
                              <td className="px-4 py-2 text-sm text-slate-800">{getSalesJourneyStageLabel(stage)}</td>
                              <td className="px-4 py-2 text-sm text-slate-600">
                                {formatLastPurchaseDisplayForUi(row)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">
                  Showing {salesJourneyFilteredRows.length} of {salesJourneyRows.length} loaded rows
                </div>
              </div>
            )}
          </motion.div>
        )}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default function CustomersPageWithSuspense() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-slate-600">Loading…</p>
        </div>
      }
    >
      <CustomersPage />
    </Suspense>
  )
}

