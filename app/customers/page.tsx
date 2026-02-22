'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import GoogleContactsIntegration from '@/app/components/GoogleContactsIntegration'

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

declare global {
  interface Window {
    googleContactsIntegration?: {
      signIn: () => void
      signOut: () => void
      importContacts: (data: Record<string, unknown>[]) => Promise<void>
      isSignedIn: () => boolean
      isInitialized: () => boolean
    }
  }
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
  created_at: string
  updated_at: string
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

  // Pagination
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Filters
  const [search, setSearch] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [ethnicityFilter, setEthnicityFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // Google Contacts sync
  const [isGoogleConnected, setIsGoogleConnected] = useState(false)
  const [isCheckingConnection, setIsCheckingConnection] = useState(true)
  const [importResult, setImportResult] = useState<{ success: boolean; message: string } | null>(null)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 })
  const [isImporting, setIsImporting] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) {
      fetchCustomers()
    }
  }, [user, page, search, genderFilter, ethnicityFilter, sortBy, sortOrder])

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
      const response = await fetch(`/api/customers?${params}`)
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

    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy,
        sortOrder,
      })

      if (search) params.append('search', search)
      if (genderFilter) params.append('gender', genderFilter)
      if (ethnicityFilter) params.append('ethnicity', ethnicityFilter)

      const response = await fetch(`/api/customers?${params}`)
      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch customers')
      }

      setCustomers(result.data || [])
      setTotal(result.pagination?.total || 0)
      setTotalPages(result.pagination?.totalPages || 1)
    } catch (err: any) {
      setError(err.message || 'Failed to load customers')
    } finally {
      setIsLoading(false)
    }
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

  if (loading || isLoading) {
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
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Filters & Actions */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            {/* Search */}
            <div className="md:col-span-2">
              <input
                type="text"
                placeholder="Search by name, email, or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
                className="w-full px-4 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
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
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
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
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={editingCustomer.location || ''}
                      onChange={(e) => setEditingCustomer({ ...editingCustomer, location: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
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
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">PG Code</th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Phone</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Gender</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Ethnicity</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Age</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Date of Birth</th>

                  <th className="px-4 py-3 text-left text-xs font-bold text-slate-900 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-200">
                {customers.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="px-4 py-8 text-center text-slate-500">
                      {isLoading ? 'Loading...' : 'No customers found'}
                    </td>
                  </tr>
                ) : (
                  customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
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
                          ? new Date(customer.dob).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric'
                          })
                          : '-'}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(customer)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title="Edit"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDelete(customer.id)}
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
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
          )}
        </div>
      </main>
    </div>
  )
}


