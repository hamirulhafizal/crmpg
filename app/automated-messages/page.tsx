'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  SCHEDULED_TITLE_BIRTHDAY,
  SCHEDULED_TITLE_FREE_FOLLOWUP,
  SCHEDULED_TITLE_GOLD_PRICE_POSTER,
  SCHEDULED_TITLE_INACTIVE_FOLLOWUP,
  normalizedScheduledTitle,
} from '@/app/lib/scheduled-automation-titles'

interface ScheduledMessage {
  id: string
  user_id: string
  title: string | null
  phone: string
  message: string
  scheduled_at: string
  status: 'pending' | 'sent' | 'failed'
  locked_at: string | null
  is_enable: boolean | null
  created_at: string
}

type GoldPosterConfig = {
  session: string
  groups: string[]
}

const DEFAULT_TEMPLATE = 'Salam {SenderName}, ini PG Code {PGCode} {SenderName} ya'
const DEFAULT_INACTIVE_FOLLOWUP_TEMPLATE =
  `saya semak kat system tiada pembelian sejak {LastPurchaseDate}

boleh saya tahu, {SenderName} ada perlukan apa-apa bantuan ka ?`



const DEFAULT_FREE_FOLLOWUP_TEMPLATE =
  `saya semak kat system tiada jualan dalam tempoh setahun yang lalu

boleh saya tahu, {SenderName} ada perlukan apa-apa bantuan ka ?`
// Persist warm-greeting toggle without requiring a new DB column.
// The worker detects this marker and strips it before rendering the template.
const WARMUP_MESSAGE_MARKER = '__WARMUP_ENABLED__\n'

type AutomationTitleType =
  | 'birthday'
  | 'inactive_followup'
  | 'free_followup'
  | 'gold_poster'
  | 'profile'
  | 'skde'
  | 'gap'
  | 'customer'

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
    is_enable: true,
    warmup_enabled: false,
    poster_session: '',
    poster_groups: [] as string[],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState<string | null>(null)
  const [variables, setVariables] = useState<string[]>([])
  const [titleType, setTitleType] = useState<AutomationTitleType>('birthday')
  const [activeTab, setActiveTab] = useState<'messages' | 'gold_poster'>('messages')
  const [wahaSessions, setWahaSessions] = useState<Array<{ name: string; status?: string }>>([])
  const [wahaGroups, setWahaGroups] = useState<Array<{ id: string; name: string }>>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [posterPreviewTick, setPosterPreviewTick] = useState(Date.now())

  // Prevent duplicated broadcast automations:
  // If there's already a pending + enabled scheduled message with the same title,
  // disable the corresponding option in the "Title" select.
  const isBroadcastTitleOngoing = (scheduledTitle: string): boolean => {
    const wanted = normalizedScheduledTitle(scheduledTitle)
    return items.some((i) => {
      if (i.status !== 'pending') return false
      if (i.is_enable === false) return false // treat NULL as enabled (cron compatible)
      if (editing && i.id === editing.id) return false // allow current row while editing
      return normalizedScheduledTitle(i.title) === wanted
    })
  }

  const isBroadcastAutomation =
    titleType === 'birthday' ||
    titleType === 'inactive_followup' ||
    titleType === 'free_followup' ||
    titleType === 'gold_poster'

  const filteredItems = items.filter((item) => {
    const isGold = normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)
    return activeTab === 'gold_poster' ? isGold : !isGold
  })

  const parseGoldPosterConfig = (raw: string): GoldPosterConfig | null => {
    try {
      const parsed = JSON.parse(raw) as Partial<GoldPosterConfig>
      const session = String(parsed.session || '').trim()
      const groups = Array.isArray(parsed.groups)
        ? parsed.groups.map((g) => String(g || '').trim()).filter((g) => g.endsWith('@g.us'))
        : []
      if (!session || groups.length === 0) return null
      return { session, groups }
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!user) return
    if (!(isCreating || editing)) return
    if (titleType !== 'gold_poster') return
    const loadSessions = async () => {
      try {
        const res = await fetch('/api/waha/sessions')
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Failed to load sessions')
        setWahaSessions(Array.isArray(json.sessions) ? json.sessions : [])
      } catch {
        setWahaSessions([])
      }
    }
    loadSessions()
  }, [user, isCreating, editing, titleType])

  const loadGroups = async (sessionName: string) => {
    if (!sessionName) {
      setWahaGroups([])
      setGroupSearch('')
      return
    }
    setIsGroupsLoading(true)
    try {
      const res = await fetch(`/api/waha/sessions/${encodeURIComponent(sessionName)}/groups`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load groups')
      setWahaGroups(Array.isArray(json.groups) ? json.groups : [])
    } catch {
      setWahaGroups([])
    } finally {
      setIsGroupsLoading(false)
    }
  }

  useEffect(() => {
    if (titleType !== 'gold_poster' || !form.poster_session) {
      setWahaGroups([])
      setGroupSearch('')
      return
    }
    loadGroups(form.poster_session)
  }, [titleType, form.poster_session])

  const filteredWahaGroups = wahaGroups.filter((g) =>
    groupSearch.trim()
      ? `${g.name} ${g.id}`.toLowerCase().includes(groupSearch.trim().toLowerCase())
      : true
  )

  const posterPreviewUrl = `/api/automation/gold-poster?preview=${posterPreviewTick}`

  useEffect(() => {
    if (titleType !== 'gold_poster' || !(isCreating || editing)) return
    setPosterPreviewTick(Date.now())
    const timer = setInterval(() => setPosterPreviewTick(Date.now()), 30000)
    return () => clearInterval(timer)
  }, [titleType, isCreating, editing])

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
      title: SCHEDULED_TITLE_BIRTHDAY,
      phone: '',
      message: DEFAULT_TEMPLATE,
      scheduled_at: '',
      is_enable: true,
      warmup_enabled: false,
      poster_session: '',
      poster_groups: [],
    })
    setTitleType('birthday')
    setEditing(null)
    setIsCreating(true)
  }

  const openCreateGoldPoster = () => {
    const nowMy = new Date(Date.now() + 3 * 60 * 1000)
    const hh = String(nowMy.getHours()).padStart(2, '0')
    const mm = String(nowMy.getMinutes()).padStart(2, '0')
    setForm({
      title: SCHEDULED_TITLE_GOLD_PRICE_POSTER,
      phone: '',
      message: 'Assalamualaikum & salam sejahtera.\nIni update terkini harga buyback Public Gold hari ini.',
      scheduled_at: `${hh}:${mm}`,
      is_enable: true,
      warmup_enabled: false,
      poster_session: '',
      poster_groups: [],
    })
    setTitleType('gold_poster')
    setEditing(null)
    setIsCreating(true)
  }

  const openEdit = (item: ScheduledMessage) => {
    const rawTitle = (item.title || '').trim()
    let inferredType: AutomationTitleType = 'customer'
    const lower = rawTitle.toLowerCase()
    if (lower === 'birthday' || lower.includes('birthday')) inferredType = 'birthday'
    else if (lower === 'inactive follow-up') inferredType = 'inactive_followup'
    else if (lower === 'free account follow-up') inferredType = 'free_followup'
    else if (lower === 'gold price poster') inferredType = 'gold_poster'
    else if (lower.startsWith('profile')) inferredType = 'profile'
    else if (lower.includes('skde')) inferredType = 'skde'
    else if (lower === 'gap') inferredType = 'gap'

    let scheduledValue = ''
    if (item.scheduled_at) {
      const d = new Date(item.scheduled_at)
      if (!Number.isNaN(d.getTime())) {
        if (
          inferredType === 'birthday' ||
          inferredType === 'inactive_followup' ||
          inferredType === 'free_followup' ||
          inferredType === 'gold_poster'
        ) {
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

    const itemMessage = item.message || ''
    const hasWarmup = itemMessage.startsWith(WARMUP_MESSAGE_MARKER)
    const posterPayload = inferredType === 'gold_poster'
      ? (() => {
          try {
            const parsed = JSON.parse(item.phone || '{}') as { session?: string; groups?: string[] }
            return {
              session: String(parsed.session || ''),
              groups: Array.isArray(parsed.groups)
                ? parsed.groups.map((g) => String(g)).filter((g) => g.endsWith('@g.us'))
                : [],
            }
          } catch {
            return { session: '', groups: [] as string[] }
          }
        })()
      : { session: '', groups: [] as string[] }

    setForm({
      title: rawTitle,
      phone: item.phone,
      message: hasWarmup ? itemMessage.slice(WARMUP_MESSAGE_MARKER.length) : itemMessage,
      scheduled_at: scheduledValue,
      is_enable: item.is_enable ?? true,
      warmup_enabled: hasWarmup,
      poster_session: posterPayload.session,
      poster_groups: posterPayload.groups,
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
      if (titleType === 'gold_poster' && (!form.poster_session || form.poster_groups.length === 0)) {
        throw new Error('Please choose WAHA session and at least one group')
      }
      if (!isBroadcastAutomation && !form.phone) {
        throw new Error('Phone is required for this message type')
      }

      // Normalise scheduled_at into a full ISO datetime.
      // - For broadcast automations (time-only input), schedule the *next* occurrence of that time.
      // - For others (datetime-local), use the exact chosen datetime.
      let scheduledAtIso: string
      if (isBroadcastAutomation) {
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
        phone:
          titleType === 'gold_poster'
            ? JSON.stringify({ session: form.poster_session, groups: form.poster_groups })
            : isBroadcastAutomation
              ? ''
              : form.phone,
        message: form.warmup_enabled ? `${WARMUP_MESSAGE_MARKER}${form.message}` : form.message,
        scheduled_at: scheduledAtIso,
        is_enable: form.is_enable,
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

  const handleTestSend = async (id: string) => {
    setIsTesting(id)
    setError(null)
    try {
      const res = await fetch(`/api/automated-messages/${id}/send-test`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to send test')
      alert(`Test sent: ${json.sentCount ?? 0} group(s).`)
    } catch (e: any) {
      setError(e.message || 'Failed to send test')
    } finally {
      setIsTesting(null)
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
              onClick={activeTab === 'gold_poster' ? openCreateGoldPoster : openCreate}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {activeTab === 'gold_poster' ? 'Schedule poster' : 'Schedule message'}
            </button>
          </div>
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
            <button
              onClick={() => setActiveTab('messages')}
              className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'messages' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Messages
            </button>
            <button
              onClick={() => setActiveTab('gold_poster')}
              className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'gold_poster' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Gold Poster
            </button>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {activeTab === 'gold_poster' ? (
              <>
                Schedule daily Public Gold buyback poster sends to one or more WAHA groups. Image is sent first, then your text message.
              </>
            ) : (
              <>
                Create scheduled WhatsApp messages for specific phone numbers, or broadcast automations (birthday, inactive
                follow-up, free-account follow-up) that run daily at the time you set. Templates support variables like{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{SenderName}'}</code>,{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{PGCode}'}</code>,{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{LastPurchaseDate}'}</code>, and{' '}
                <code className="px-1 py-0.5 rounded bg-slate-100 text-xs">{'{RegistrationDate}'}</code> from each customer
                record.
              </>
            )}
          </p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="py-12 text-center text-slate-500">Loading scheduled messages...</div>
          ) : filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="mb-4">
                {activeTab === 'gold_poster' ? 'No scheduled gold poster yet.' : 'No scheduled messages yet.'}
              </p>
              <button
                onClick={activeTab === 'gold_poster' ? openCreateGoldPoster : openCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {activeTab === 'gold_poster' ? 'Schedule your first poster' : 'Schedule your first message'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
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
                    {(item.status === 'pending' || normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)) && item.is_enable === false && (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          DISABLED
                        </span>
                      )}
                    </div>
                    {item.phone && normalizedScheduledTitle(item.title) !== 'gold price poster' && (
                      <p className="text-sm text-slate-600">
                        To:{' '}
                        <span className="font-mono text-slate-800">{item.phone}</span>
                      </p>
                    )}
                    {normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER) && (
                      <div className="text-sm text-slate-600">
                        {(() => {
                          const cfg = parseGoldPosterConfig(item.phone)
                          if (!cfg) return <p>Config invalid. Edit this schedule.</p>
                          return (
                            <>
                              <p>Session: <span className="font-mono text-slate-800">{cfg.session}</span></p>
                              <p>Groups: <span className="font-semibold text-slate-800">{cfg.groups.length}</span></p>
                            </>
                          )
                        })()}
                      </div>
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
                    <p className="text-sm text-slate-700 mt-1 line-clamp-2">
                      {item.message.startsWith(WARMUP_MESSAGE_MARKER)
                        ? item.message.slice(WARMUP_MESSAGE_MARKER.length)
                        : item.message}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {(item.status === 'pending' || normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)) && (
                      <>
                        <button
                          onClick={() => openEdit(item)}
                          className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        {normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER) && (
                          <button
                            onClick={() => handleTestSend(item.id)}
                            disabled={isTesting === item.id}
                            className="px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isTesting === item.id ? 'Sending...' : 'Send test now'}
                          </button>
                        )}
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
                    {activeTab === 'gold_poster' && isCreating && !editing ? (
                      <div className="w-full px-3 py-2 text-slate-900 bg-blue-50 border border-blue-200 rounded-lg">
                        Gold price poster (daily groups)
                      </div>
                    ) : (
                      <select
                      value={titleType}
                      onChange={(e) => {
                        const value = e.target.value as AutomationTitleType
                        setTitleType(value)
                        setForm(current => {
                          if (value === 'birthday')
                            return { ...current, title: SCHEDULED_TITLE_BIRTHDAY, message: DEFAULT_TEMPLATE }
                          if (value === 'inactive_followup')
                            return {
                              ...current,
                              title: SCHEDULED_TITLE_INACTIVE_FOLLOWUP,
                              message: DEFAULT_INACTIVE_FOLLOWUP_TEMPLATE,
                            }
                          if (value === 'free_followup')
                            return {
                              ...current,
                              title: SCHEDULED_TITLE_FREE_FOLLOWUP,
                              message: DEFAULT_FREE_FOLLOWUP_TEMPLATE,
                            }
                          if (value === 'gold_poster')
                            return {
                              ...current,
                              title: SCHEDULED_TITLE_GOLD_PRICE_POSTER,
                              message:
                                'Assalamualaikum & salam sejahtera.\nIni update terkini harga buyback Public Gold hari ini.',
                              poster_session: current.poster_session || '',
                              poster_groups: current.poster_groups || [],
                            }
                          if (value === 'profile') return { ...current, title: 'Profile (coming soon)' }
                          if (value === 'skde') return { ...current, title: 'SKDE (coming soon)' }
                          if (value === 'gap') return { ...current, title: 'GAP (coming soon)' }
                          return { ...current, title: '' }
                        })
                      }}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="birthday" disabled={isBroadcastTitleOngoing(SCHEDULED_TITLE_BIRTHDAY)}>
                        Birthday
                      </option>
                      <option
                        value="free_followup"
                        disabled={isBroadcastTitleOngoing(SCHEDULED_TITLE_FREE_FOLLOWUP)}
                      >
                        Free account follow-up (registration anniversary)
                      </option>
                      <option
                        value="gold_poster"
                        disabled={isBroadcastTitleOngoing(SCHEDULED_TITLE_GOLD_PRICE_POSTER)}
                      >
                        Gold price poster (daily groups)
                      </option>
                      <option
                        disabled
                        value="inactive_followup"
                        title={
                          isBroadcastTitleOngoing(SCHEDULED_TITLE_INACTIVE_FOLLOWUP)
                            ? 'Already scheduled'
                            : 'Coming soon'
                        }
                      >
                        Inactive follow-up (last purchase anniversary)
                      </option>
                      <option disabled value="profile">Profile (coming soon)</option>
                      <option disabled value="skde">SKDE (coming soon)</option>
                      <option disabled value="gap">GAP (coming soon)</option>
                      {/* <option value="customer">Customer (custom title)</option> */}
                    </select>
                    )}

                    {(titleType === 'inactive_followup' || titleType === 'free_followup') && (
                      <p className="text-xs text-slate-500 mt-2">
                        Auto-send logic: this automation will check customers daily (Malaysia date) and
                        send when the customer matches the selected rule:
                        {titleType === 'inactive_followup'
                          ? ' same month/day as their Last Purchase Date (inactive)'
                          : ' same month/day as their Date Register (or record created date) (free)'}.
                        Each customer is sent at most once for each automation type.
                      </p>
                    )}

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

                {!isBroadcastAutomation && (
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

                {titleType === 'gold_poster' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">WAHA Session</label>
                      <select
                        value={form.poster_session}
                        onChange={(e) =>
                          setForm((cur) => ({ ...cur, poster_session: e.target.value, poster_groups: [] }))
                        }
                        className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">Select session...</option>
                        {wahaSessions.map((s) => (
                          <option key={s.name} value={s.name}>
                            {s.name} {s.status ? `(${s.status})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Target Groups</label>
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          type="text"
                          value={groupSearch}
                          onChange={(e) => setGroupSearch(e.target.value)}
                          placeholder="Search group name..."
                          className="flex-1 px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setGroupSearch('')
                            void loadGroups(form.poster_session)
                          }}
                          disabled={!form.poster_session || isGroupsLoading}
                          className="px-3 py-2 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                        >
                          {isGroupsLoading ? 'Loading...' : 'View all groups'}
                        </button>
                      </div>
                      <div className="max-h-44 overflow-auto border border-slate-300 rounded-lg p-2 bg-white space-y-1">
                        {filteredWahaGroups.length === 0 ? (
                          <p className="text-xs text-slate-500 px-2 py-1">
                            {form.poster_session
                              ? groupSearch.trim()
                                ? 'No groups match your search'
                                : 'No groups found for this session'
                              : 'Choose session first'}
                          </p>
                        ) : (
                          filteredWahaGroups.map((g) => {
                            const checked = form.poster_groups.includes(g.id)
                            return (
                              <label key={g.id} className="flex items-start gap-2 px-2 py-1 rounded hover:bg-slate-50">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(e) =>
                                    setForm((cur) => ({
                                      ...cur,
                                      poster_groups: e.target.checked
                                        ? [...cur.poster_groups, g.id]
                                        : cur.poster_groups.filter((x) => x !== g.id),
                                    }))
                                  }
                                />
                                <span className="text-sm text-slate-700">
                                  {g.name} <span className="text-xs text-slate-400">({g.id})</span>
                                </span>
                              </label>
                            )
                          })
                        )}
                      </div>
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Scheduled time {isBroadcastAutomation && '(daily run — time only)'}
                  </label>
                  {isBroadcastAutomation ? (
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
                    {isBroadcastAutomation
                      ? 'Each day at this time (Malaysia date), matching customers receive at most one message per automation. Inactive: same month/day as last purchase. Free: same month/day as Date Register (or record created date).'
                      : 'Messages will be sent at this time. Cron runs every minute, so there may be up to ~60s delay.'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="min-w-0">
                    <label className="block text-sm font-medium text-slate-700">Enabled</label>
                    <p className="text-xs text-slate-500 mt-1">
                      When disabled, this message will be skipped by the automation cron.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 w-[35%] md:w-[17%]"> 

                    <button
                      type="button"
                      role="switch"
                      aria-label="Enable scheduled message"
                      aria-checked={Boolean(form.is_enable)}
                      onClick={() =>
                        setForm((cur) => ({ ...cur, is_enable: !Boolean(cur.is_enable) }))
                      }
                      className={`relative inline-flex h-6 w-[-webkit-fill-available] items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                        form.is_enable ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                          form.is_enable ? 'translate-x-6' : 'translate-x-0'
                        }`}
                      />
                    </button>

                  </div>
                </div>

                {(titleType === 'inactive_followup' || titleType === 'free_followup') && (
                  <div className="flex items-center justify-between gap-4 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="min-w-0">
                      <label className="block text-sm font-medium text-slate-700">Warm greeting</label>
                      <p className="text-xs text-slate-500 mt-1">
                        Malay: <span className="font-mono">Salam, {'{SenderName}'}</span>
                        <br />
                        Others: <span className="font-mono">Selamat Pagi/Petang/Malam, {'{SenderName}'}</span>
                        <br />
                        Send greeting, wait 3–5s, then send the main template.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 w-[35%] md:w-[17%]">
                      <button
                        type="button"
                        role="switch"
                        aria-label="Enable warm greeting"
                        aria-checked={Boolean(form.warmup_enabled)}
                        onClick={() =>
                          setForm((cur) => ({ ...cur, warmup_enabled: !Boolean(cur.warmup_enabled) }))
                        }
                        className={`relative inline-flex h-6 w-[-webkit-fill-available] items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                          form.warmup_enabled ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                            form.warmup_enabled ? 'translate-x-6' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                )}

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

                {titleType === 'gold_poster' && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-slate-700">Poster preview (live)</label>
                      <button
                        type="button"
                        onClick={() => setPosterPreviewTick(Date.now())}
                        className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
                      >
                        Refresh
                      </button>
                    </div>
                    <img
                      src={posterPreviewUrl}
                      alt="Gold poster preview"
                      className="w-full rounded-lg border border-slate-200 bg-white"
                    />
                    <div className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="text-xs text-slate-500 mb-1">Message preview</p>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap">
                        {form.message.trim() || '(empty message)'}
                      </p>
                    </div>
                  </div>
                )}
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
