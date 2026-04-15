'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import GoogleContactsIntegration from '@/app/components/GoogleContactsIntegration'
import CustomerLocationCombobox from '@/app/components/CustomerLocationCombobox'
import {
  getAccountStatusKey,
  getAccountStatusLabel,
  formatLastPurchaseDisplayForUi,
  type AccountStatusKey,
} from '@/app/lib/customer-account-status'

const EMPTY_STATUS_COUNTS: Record<AccountStatusKey, number> = {
  temporary: 0,
  freeze: 0,
  active: 0,
  free: 0,
  inactive: 0,
  unknown: 0,
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

export default function CustomersPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isEditing, setIsEditing] = useState<string | null>(null)
  const [editingCustomer, setEditingCustomer] = useState<Partial<Customer> | null>(null)

  // View mode: paginated or show all
  const [viewMode, setViewMode] = useState<'paginated' | 'all'>('paginated')

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
  const [birthdayFilter, setBirthdayFilter] = useState<'today' | 'month' | ''>('')
  const [accountStatusFilter, setAccountStatusFilter] = useState<AccountStatusKey | ''>('')
  const [registerMonthFilter, setRegisterMonthFilter] = useState('')
  const [lastPurchaseMonthFilter, setLastPurchaseMonthFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

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
  const isMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

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
    if (user) {
      fetchCustomers()
    }
  }, [user, page, search, genderFilter, ethnicityFilter, birthdayFilter, accountStatusFilter, registerMonthFilter, lastPurchaseMonthFilter, sortBy, sortOrder, viewMode])

  const handleSearch = () => {
    setSearch(searchInput)
    setPage(1)
  }

  const handleClearFilters = () => {
    setSearchInput('')
    setSearch('')
    setGenderFilter('')
    setEthnicityFilter('')
    setBirthdayFilter('')
    setAccountStatusFilter('')
    setRegisterMonthFilter('')
    setLastPurchaseMonthFilter('')
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
    setCustomers([])

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
      if (birthdayFilter) params.append('birthday', birthdayFilter)
      if (accountStatusFilter) params.append('accountStatus', accountStatusFilter)
      if (registerMonthFilter) params.append('registerMonth', registerMonthFilter)
      if (lastPurchaseMonthFilter) params.append('lastPurchaseMonth', lastPurchaseMonthFilter)

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

  const toggleSort = (field: 'created_at' | 'register_date' | 'last_purchase_date' | 'pg_code' | 'dob') => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortBy(field)
      setSortOrder(field === 'pg_code' || field === 'dob' ? 'asc' : 'desc')
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

  const handleEdit = (customer: Customer) => {
    setIsEditing(customer.id)
    setEditingCustomer({ ...customer })
  }

  const handleSaveEdit = async () => {
    if (!editingCustomer || !isEditing) return

    try {
      const response = await fetch(`/api/customers/${isEditing}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(editingCustomer),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update customer')
      }

      setIsEditing(null)
      setEditingCustomer(null)
      fetchCustomers()
    } catch (err: any) {
      setError(err.message || 'Failed to update customer')
    }
  }

  const handleCreate = async () => {
    if (!editingCustomer) return

    setIsCreating(true)
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customers: [editingCustomer],
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create customer')
      }

      setIsCreating(false)
      setEditingCustomer(null)
      fetchCustomers()
    } catch (err: any) {
      setError(err.message || 'Failed to create customer')
      setIsCreating(false)
    }
  }

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


            {/* <h1 className="text-2xl font-semibold text-slate-900">Customer Management</h1>
                <p className="text-sm text-slate-600 mt-1">
                  Total: {total} customer(s) | Page {page} of {totalPages}
                </p> */}

          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        {/* Filters & Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
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

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => {
                setEditingCustomer({})
                setIsCreating(true)
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Customer
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

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Create/Edit Modal */}
        {(isCreating || isEditing) && editingCustomer && (
              // {/* // on mobile and below screen size add padding 0 */}

          <div className={`fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 ${window.innerWidth < 768 ? 'p-0' : 'p-4'}`}>
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              
              {/* // on mobile and below screen size add padding-bottom 2rem */}
              <div className={`p-6 ${window.innerWidth < 768 ? 'pb-24' : 'pb-6'}`}>
                <h2 className="text-xl font-semibold text-slate-900 mb-4">
                  {isCreating ? 'Create Customer' : 'Edit Customer'}
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={editingCustomer.name || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editingCustomer.email || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editingCustomer.phone || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={editingCustomer.dob || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, dob: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                    <select
                      value={editingCustomer.gender || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, gender: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Ethnicity</label>
                    <select
                      value={editingCustomer.ethnicity || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, ethnicity: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">Select...</option>
                      <option value="Malay">Malay</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Indian">Indian</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor="customer-location" className="block text-sm font-medium text-slate-700 mb-1">
                      Location
                    </label>
                    <CustomerLocationCombobox
                      id="customer-location"
                      value={editingCustomer.location || ''}
                      onChange={(location) => setEditingCustomer({ ...editingCustomer, location })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-500">Locality / town (Malaysia). Type to search or enter any text.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">PG Code</label>
                    <input
                      type="text"
                      value={editingCustomer.pg_code || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, pg_code: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sender Name</label>
                    <input
                      type="text"
                      value={editingCustomer.sender_name || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, sender_name: e.target.value })}
                      placeholder="e.g. Pn Haszelina, Tn Azamuddin"
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Save Name</label>
                    <input
                      type="text"
                      value={editingCustomer.save_name || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, save_name: e.target.value })}
                      placeholder="e.g. PG00113237 - Pn Haszelina"
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!editingCustomer.is_married}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, is_married: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">Married</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!editingCustomer.is_friend}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, is_friend: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">Friend</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parseProfileVerified(editingCustomer.original_data) === true}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            'Profile Verified': e.target.checked ? 'Yes' : 'No',
                          },
                        })
                      }
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                    />
                    <span className="text-sm font-medium text-slate-700">Profile verified</span>
                  </label>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rank</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Rank'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            Rank: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Branch</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Branch'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            Branch: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Empire Size</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Empire Size'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            'Empire Size': e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Parent Name</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Parent Name'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            'Parent Name': e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date Register</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Date Register'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            'Date Register': e.target.value,
                          },
                        })
                      }
                      placeholder="YYYY-MM-DD HH:mm:ss"
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Total Frontline</label>
                    <input
                      type="text"
                      value={editingCustomer.original_data?.['Total Frontline'] || ''}
                      onChange={(e) =>
                        setEditingCustomer({
                          ...editingCustomer,
                          original_data: {
                            ...(editingCustomer.original_data || {}),
                            'Total Frontline': e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-1">Account Status</label>
                    <div
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800"
                      aria-live="polite"
                    >
                      {getAccountStatusLabel(editingCustomer)}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      Last Purchase Date: {editingCustomer.original_data?.['Last Purchase Date'] || '-'}
                    </p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    onClick={() => {
                      setIsCreating(false)
                      setIsEditing(null)
                      setEditingCustomer(null)
                    }}
                    className="px-4 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={isCreating ? handleCreate : handleSaveEdit}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                  >
                    {isCreating ? 'Create' : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                  sub: 'Monthly buyer',
                  className: 'border-green-200 bg-green-50/80 text-green-900',
                },
                {
                  key: 'inactive' as const,
                  label: 'Inactive',
                  sub: 'Recent, not monthly',
                  className: 'border-red-200 bg-red-50/80 text-red-900',
                },
                {
                  key: 'free' as const,
                  label: 'Free',
                  sub: '> 12 mo. no buy',
                  className: 'border-amber-200 bg-amber-50/80 text-amber-950',
                },
                {
                  key: 'freeze' as const,
                  label: 'Freeze',
                  sub: '3–12 mo. no buy',
                  className: 'border-orange-200 bg-orange-50/80 text-orange-950',
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
            ).map(({ key, label, sub, className }) => (
              <div
                key={key}
                className={`rounded-2xl border px-4 py-3 shadow-sm transition-transform duration-200 hover:scale-[1.02] ${className}`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-90">{label}</p>
                <p className="mt-1 text-2xl font-bold tabular-nums">{statusCounts[key]}</p>
                <p className="mt-0.5 text-[10px] opacity-80 leading-tight">{sub}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-white">
            Counts reflect all saved customers. They refresh after create, edit, or delete.
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
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Age</th>
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
                      onClick={() => toggleSort('created_at')}
                      className="inline-flex items-center gap-1 hover:text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                      title={sortOrder === 'desc' ? 'Newest first (click for oldest)' : 'Oldest first (click for newest)'}
                    >
                      Imported at
                      {sortBy === 'created_at' && (
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
                    <td colSpan={19} className="px-4 py-8 text-center text-slate-500">
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
                      className="cursor-pointer hover:bg-slate-50 transition-colors"
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
                      <td className="px-4 py-3 text-sm text-slate-800">{customer.age || '-'}</td>
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

                      <td className="px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            accountKey === 'inactive'
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
                        {customer.created_at
                          ? new Date(customer.created_at).toLocaleDateString('en-US', {
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
      </main>
    </div>
  )
}


