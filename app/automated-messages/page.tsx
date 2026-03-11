'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface ScheduledMessage {
  id: string
  user_id: string
  title: string | null
  phone: string
  message: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed'
  locked_at: string | null
  created_at: string
}

const DEFAULT_TEMPLATE = 'Hi {SenderName}, your PG Code is {PGCode}'

export default function AutomatedMessagesPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [items, setItems] = useState<ScheduledMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduledMessage | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    phone: '',
    message: DEFAULT_TEMPLATE,
    scheduled_at: '',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [variables, setVariables] = useState<string[]>([])
  const [titleType, setTitleType] = useState<'birthday' | 'profile' | 'skde' | 'gap' | 'customer'>('birthday')
  const isBirthdayTitle = titleType === 'birthday'

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (user) fetchItems()
  }, [user])

  useEffect(() => {
    if (!user) return
    const loadVariables = async () => {
      try {
        const res = await fetch('/api/customers/variables')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load variables')
        setVariables(Array.isArray(json.variables) ? json.variables : [])
      } catch {
        // Fallback to a sensible default list if the API fails
        setVariables([
          'SenderName',
          'Name',
          'FirstName',
          'SaveName',
          'PGCode',
          'Phone',
          'Email',
          'Location',
          'Gender',
          'Ethnicity',
          'Age',
          'DOB',
        ])
      }
    }
    loadVariables()
  }, [user])

  const fetchItems = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/automated-messages')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load')
      setItems(json.data || [])
    } catch (e: any) {
      setError(e.message || 'Failed to load scheduled messages')
    } finally {
      setIsLoading(false)
    }
  }

  const openCreate = () => {
    setForm({
      title: 'Birthday',
      phone: '',
      message: DEFAULT_TEMPLATE,
      scheduled_at: '',
    })
    setTitleType('birthday')
    setEditing(null)
    setIsCreating(true)
  }

  const openEdit = (item: ScheduledMessage) => {
    const rawTitle = (item.title || '').trim()
    let inferredType: 'birthday' | 'profile' | 'skde' | 'gap' | 'customer' = 'customer'
    const lower = rawTitle.toLowerCase()
    if (lower.includes('birthday')) inferredType = 'birthday'
    else if (lower.startsWith('profile')) inferredType = 'profile'
    else if (lower.includes('skde')) inferredType = 'skde'
    else if (lower === 'gap') inferredType = 'gap'

    let scheduledValue = ''
    if (item.scheduled_at) {
      const d = new Date(item.scheduled_at)
      if (!Number.isNaN(d.getTime())) {
        if (inferredType === 'birthday') {
          // For birthday flows we use a time-only input (HH:MM)
          const hh = String(d.getHours()).padStart(2, '0')
          const mm = String(d.getMinutes()).padStart(2, '0')
          scheduledValue = `${hh}:${mm}`
        } else {
          // For other types we use datetime-local (YYYY-MM-DDTHH:MM)
          const iso = new Date(
            d.getTime() - d.getTimezoneOffset() * 60000
          ).toISOString()
          scheduledValue = iso.slice(0, 16)
        }
      }
    }

    setForm({
      title: rawTitle,
      phone: item.phone,
      message: item.message,
      scheduled_at: scheduledValue,
    })
    setTitleType(inferredType)
    setEditing(item)
    setIsCreating(false)
  }

  const closeModal = () => {
    setEditing(null)
    setIsCreating(false)
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      if (!form.title || !form.message || !form.scheduled_at) {
        throw new Error('Title, message and scheduled time are required')
      }
      if (!isBirthdayTitle && !form.phone) {
        throw new Error('Phone is required for non-birthday messages')
      }

      // Normalise scheduled_at into a full ISO datetime.
      // - For birthday flows (time-only input), schedule the *next* occurrence of that time.
      // - For others (datetime-local), use the exact chosen datetime.
      let scheduledAtIso: string
      if (isBirthdayTitle) {
        const [hh, mm] = form.scheduled_at.split(':')
        if (!hh || mm === undefined) {
          throw new Error('Please provide a valid time')
        }
        const now = new Date()
        const scheduled = new Date(now)
        scheduled.setHours(Number(hh), Number(mm), 0, 0)
        // If the time today has already passed, schedule for tomorrow at that time
        if (scheduled <= now) {
          scheduled.setDate(scheduled.getDate() + 1)
        }
        scheduledAtIso = scheduled.toISOString()
      } else {
        const d = new Date(form.scheduled_at)
        if (Number.isNaN(d.getTime())) {
          throw new Error('Please provide a valid scheduled date & time')
        }
        scheduledAtIso = d.toISOString()
      }

      const payload = {
        title: form.title,
        phone: isBirthdayTitle ? '' : form.phone,
        message: form.message,
        scheduled_at: scheduledAtIso,
      }

      if (editing) {
        const res = await fetch(`/api/automated-messages/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to update')
      } else {
        const res = await fetch('/api/automated-messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to create')
      }

      await fetchItems()
      closeModal()
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Cancel this scheduled message? It will not be sent.')) return
    setIsDeleting(id)
    setError(null)
    try {
      const res = await fetch(`/api/automated-messages/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to delete')
      await fetchItems()
      if (editing?.id === id) closeModal()
    } catch (e: any) {
      setError(e.message || 'Failed to delete')
    } finally {
      setIsDeleting(null)
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <svg
            className="animate-spin h-8 w-8 text-blue-600 mx-auto"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <header className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-3"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-slate-200/50">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold text-slate-900">Automated WhatsApp Messages</h1>
            <button
              onClick={openCreate}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Schedule message
            </button>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Create scheduled WhatsApp messages for specific phone numbers. Templates support variables like{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{SenderName}'}</code> and{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{PGCode}'}</code> which are resolved from your
            profile when sending.
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-500">Loading scheduled messages...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="mb-4">No scheduled messages yet.</p>
              <button
                onClick={openCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Schedule your first message
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {item.title || 'Untitled'}
                      </span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          item.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : item.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
                        }`}
                      >
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                    {item.phone && (
                      <p className="text-sm text-slate-600">
                        To:{' '}
                        <span className="font-mono text-slate-800">{item.phone}</span>
                      </p>
                    )}
                    <p className="text-sm text-slate-600">
                      Scheduled at{' '}
                      {new Date(item.scheduled_at).toLocaleString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                    <p className="text-sm text-slate-700 mt-1 line-clamp-2">{item.message}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.status === 'pending' && (
                      <>
                        <button
                          onClick={() => openEdit(item)}
                          className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          disabled={isDeleting === item.id}
                          className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isDeleting === item.id ? 'Deleting...' : 'Cancel'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="text-sm text-slate-500">
          <Link href="/whatsapp-services" className="text-blue-600 hover:underline">
            ← Back to WhatsApp Services
          </Link>
          {' '}(send birthday wishes and view today’s list)
        </div>
      </main>

      {/* Create / Edit Modal */}
      {(isCreating || editing) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-semibold text-slate-900 mb-4">
                {editing ? 'Edit scheduled message' : 'Schedule message'}
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <div className="flex flex-col gap-2">
                    <select
                      value={titleType}
                      onChange={(e) => {
                        const value = e.target.value as 'birthday' | 'profile' | 'skde' | 'gap' | 'customer'
                        setTitleType(value)
                        setForm(current => {
                          if (value === 'birthday') return { ...current, title: 'Birthday' }
                          if (value === 'profile') return { ...current, title: 'Profile (coming soon)' }
                          if (value === 'skde') return { ...current, title: 'SKDE (coming soon)' }
                          if (value === 'gap') return { ...current, title: 'GAP (coming soon)' }
                          // customer-defined: clear title and let user type
                          return { ...current, title: '' }
                        })
                      }}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="birthday">Birthday</option>
                      <option value="profile">Profile (coming soon)</option>
                      <option value="skde">SKDE (coming soon)</option>
                      <option value="gap">GAP (coming soon)</option>
                      <option value="customer">Customer (custom title)</option>
                    </select>

                    {titleType === 'customer' && (
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => setForm({ ...form, title: e.target.value })}
                        placeholder="e.g. Hari Raya wish, Rent reminder..."
                        className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    )}
                  </div>
                </div>

                {!isBirthdayTitle && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Target phone number</label>
                    <input
                      type="text"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="60123456789"
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Scheduled time {isBirthdayTitle && '(time only)'}
                  </label>
                  {isBirthdayTitle ? (
                    <input
                      type="time"
                      value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  ) : (
                    <input
                      type="datetime-local"
                      value={form.scheduled_at}
                      onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus-border-transparent"
                    />
                  )}
                  <p className="text-xs text-slate-500 mt-1">
                    Messages will be sent at this time. Cron runs every minute, so there may be up to ~60s delay.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Message template</label>
                  <textarea
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    rows={4}
                    placeholder={DEFAULT_TEMPLATE}
                    className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Available variables from your customer record:{' '}
                    {variables.length > 0
                      ? variables.map((v, idx) => (
                          <span key={v}>
                            {'{'}
                            {v}
                            {'}'}
                            {idx < variables.length - 1 ? ', ' : ''}
                          </span>
                        ))
                      : 'loading...'}
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-70 transition-colors font-medium"
                >
                  {isSaving ? 'Saving...' : editing ? 'Save changes' : 'Schedule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
