'use client'

import { useAuth } from '@/app/contexts/auth-context'
import { useCustomerEditModal } from '@/app/contexts/customer-edit-modal-context'
import { useRouter } from 'next/navigation'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'framer-motion'
import {
  isBroadcastScheduledTitle,
  SCHEDULED_TITLE_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP,
  SCHEDULED_TITLE_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP,
  SCHEDULED_TITLE_BIRTHDAY,
  SCHEDULED_TITLE_FREE_FOLLOWUP,
  SCHEDULED_TITLE_GOLD_PRICE_POSTER,
  SCHEDULED_TITLE_INACTIVE_FOLLOWUP,
  normalizedScheduledTitle,
} from '@/app/lib/scheduled-automation-titles'
import type { AutomationAudiencePreview } from '@/app/lib/automation-audience-preview'

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
const DEFAULT_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP_TEMPLATE =
  `saya dapat info dari PG, {SenderName} dah mula menabung Emas, Tahniah ya {SenderName} ! 👏🎉 \n
cuma status profile masih belum verified.\n\nkalau {SenderName} sedia sekarang, kita update profile kejap boleh ?`
const DEFAULT_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP_TEMPLATE =
  `saya semak akaun {SenderName} aktif dan profile sudah verified 👍

belum aktifkan Direct Debit lagi kan? kalau {SenderName} nak, saya boleh bantu setup auto debit sekarang.`
const DEFAULT_AUTOMATION_TEMPLATES = {
  birthday: DEFAULT_TEMPLATE,
  inactive_followup: DEFAULT_INACTIVE_FOLLOWUP_TEMPLATE,
  free_followup: DEFAULT_FREE_FOLLOWUP_TEMPLATE,
  active_profile_unverified_followup: DEFAULT_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP_TEMPLATE,
  active_verified_no_autodebit_followup: DEFAULT_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP_TEMPLATE,
}
// Persist warm-greeting toggle without requiring a new DB column.
// The worker detects this marker and strips it before rendering the template.
const WARMUP_MESSAGE_MARKER = '__WARMUP_ENABLED__\n'

function localDateKeyFromIso(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const [y, mo, d] = dateKey.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  dt.setDate(dt.getDate() + deltaDays)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function todayLocalDateKey(): string {
  return localDateKeyFromIso(new Date().toISOString())
}

function scheduleKindMeta(title: string | null): { bar: string; shortLabel: string } {
  const t = normalizedScheduledTitle(title)
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_BIRTHDAY)) {
    return { bar: 'bg-pink-500', shortLabel: 'Birthday' }
  }
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_INACTIVE_FOLLOWUP)) {
    return { bar: 'bg-orange-500', shortLabel: 'Inactive follow-up' }
  }
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_FREE_FOLLOWUP)) {
    return { bar: 'bg-violet-500', shortLabel: 'Free account' }
  }
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP)) {
    return { bar: 'bg-sky-500', shortLabel: 'Profile unverified' }
  }
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP)) {
    return { bar: 'bg-teal-500', shortLabel: 'No autodebit' }
  }
  if (t === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)) {
    return { bar: 'bg-amber-500', shortLabel: 'Gold poster (group)' }
  }
  return { bar: 'bg-slate-500', shortLabel: 'One-off / other' }
}

function buildMonthGridCells(year: number, monthIndex: number): (number | null)[] {
  const first = new Date(year, monthIndex, 1)
  const startPad = first.getDay()
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < startPad; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const getDefaultScheduleTimePlus3Minutes = (): string => {
  const d = new Date(Date.now() + 3 * 60 * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

type AutomationTitleType =
  | 'birthday'
  | 'inactive_followup'
  | 'free_followup'
  | 'active_profile_unverified_followup'
  | 'active_verified_no_autodebit_followup'
  | 'gold_poster'
  | 'profile'
  | 'skde'
  | 'gap'
  | 'customer'

type ScheduleAudienceSectionProps = {
  preview: AutomationAudiencePreview | null
  loading: boolean
  error: string | null
  onOpenCustomer: (customerId: string) => void
}

const AUDIENCE_BUCKET_META: Array<{
  key: 'birthday' | 'free_followup' | 'active_profile_unverified' | 'active_verified_no_autodebit'
  label: string
  hint: string
}> = [
  { key: 'birthday', label: 'Birthday wishes', hint: 'Customers with birthday on this date.' },
  { key: 'free_followup', label: 'Free account follow-up', hint: 'Free accounts whose registration anniversary matches this date (not yet sent).' },
  { key: 'active_profile_unverified', label: 'Profile unverified', hint: 'Active, purchased this month, profile not verified (not yet sent).' },
  { key: 'active_verified_no_autodebit', label: 'No autodebit', hint: 'Active, verified, no direct debit, purchased this month (not yet sent).' },
]

function ScheduleAudienceSection({ preview, loading, error, onOpenCustomer }: ScheduleAudienceSectionProps) {
  const audienceMotionTransition = { type: 'tween' as const, duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }

  if (!loading && !error && !preview) {
    return null
  }

  return (
    <div className="mt-4">
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            key="schedule-audience-loading"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={audienceMotionTransition}
            aria-busy="true"
            aria-live="polite"
          >
            <span className="sr-only">Loading recipient preview</span>
            <div className="h-3 w-52 max-w-[85%] rounded bg-slate-200/90 animate-pulse" />
            <div className="space-y-2">
              <div className="h-3 w-full max-w-lg rounded bg-slate-200/80 animate-pulse" />
              <div className="h-3 w-full max-w-md rounded bg-slate-200/70 animate-pulse" />
            </div>
            {AUDIENCE_BUCKET_META.map(({ key }) => (
              <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="h-4 w-44 max-w-[70%] rounded bg-slate-200/90 animate-pulse" />
                  <div className="h-3 w-14 shrink-0 rounded bg-slate-200/80 animate-pulse" />
                </div>
                <div className="mt-2 h-3 w-full max-w-xl rounded bg-slate-200/70 animate-pulse" />
                <div className="mt-2 space-y-1.5">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-7 w-full rounded-lg bg-slate-200/60 animate-pulse" />
                  ))}
                </div>
              </div>
            ))}
          </motion.div>
        ) : error ? (
          <motion.p
            key="schedule-audience-error"
            className="text-sm text-red-600"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={audienceMotionTransition}
          >
            {error}
          </motion.p>
        ) : preview ? (
          <motion.div
            key="schedule-audience-preview"
            className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={audienceMotionTransition}
          >
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recipient preview (this date)</h4>
            <p className="text-xs text-slate-500">
              Estimates who would match automation rules if a run happened on this calendar day. One-to-one schedules are
              listed above only.
            </p>
            {AUDIENCE_BUCKET_META.map(({ key, label, hint }) => {
              const bucket = preview[key]
              return (
                <div key={key} className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">{label}</p>
                    <p className="text-xs font-medium text-slate-600">{bucket.total} total</p>
                  </div>
                  {bucket.error ? <p className="mt-1 text-xs text-amber-800">{bucket.error}</p> : null}
                  <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>
                  {bucket.sample.length > 0 ? (
                    <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-slate-700">
                      {bucket.sample.map((r) => {
                        const profilePath = `/customers?openCustomer=${encodeURIComponent(r.id)}`
                        const label = r.save_name || r.name || r.pg_code || r.id.slice(0, 8)
                        return (
                          <li key={r.id} className="truncate">
                            <button
                              type="button"
                              onClick={() => onOpenCustomer(r.id)}
                              className="group flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1 text-left transition hover:bg-slate-100/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <span className="font-medium text-slate-900 underline underline-offset-2">{label}</span>
                              {/* <span className="font-mono text-[11px] text-blue-600 underline decoration-blue-200 underline-offset-2 group-hover:text-blue-800">
                          {profilePath}
                        </span> */}
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  ) : bucket.total === 0 && !bucket.error ? (
                    <p className="mt-2 text-xs text-slate-500">No matching customers.</p>
                  ) : null}
                  {bucket.total > bucket.sample.length ? (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Showing first {bucket.sample.length} of {bucket.total}.
                    </p>
                  ) : null}
                </div>
              )
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

const CALENDAR_MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export default function AutomatedMessagesPage() {
  const { user, loading } = useAuth()
  const { openCustomerById } = useCustomerEditModal()
  const router = useRouter()
  const [items, setItems] = useState<ScheduledMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<ScheduledMessage | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState({
    title: '',
    phone: '',
    message: DEFAULT_AUTOMATION_TEMPLATES.birthday,
    scheduled_at: getDefaultScheduleTimePlus3Minutes(),
    is_enable: true,
    warmup_enabled: false,
    poster_session: '',
    poster_groups: [] as string[],
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState<string | null>(null)
  const [isTesting, setIsTesting] = useState<string | null>(null)
  const [variables, setVariables] = useState<string[]>([])
  const [defaultTemplates, setDefaultTemplates] = useState(DEFAULT_AUTOMATION_TEMPLATES)
  const [titleType, setTitleType] = useState<AutomationTitleType>('birthday')
  const [activeTab, setActiveTab] = useState<'personal' | 'group'>('personal')
  const [scheduleCalendarOpen, setScheduleCalendarOpen] = useState(false)
  const [scheduleViewMode, setScheduleViewMode] = useState<'day' | 'month' | 'year'>('month')
  const [scheduleCalendarMonth, setScheduleCalendarMonth] = useState(() => {
    const d = new Date()
    d.setDate(1)
    d.setHours(12, 0, 0, 0)
    return d
  })
  const [scheduleCalendarSelectedKey, setScheduleCalendarSelectedKey] = useState<string | null>(null)
  const [audiencePreview, setAudiencePreview] = useState<AutomationAudiencePreview | null>(null)
  const [audiencePreviewLoading, setAudiencePreviewLoading] = useState(false)
  const [audiencePreviewError, setAudiencePreviewError] = useState<string | null>(null)
  const [wahaSessions, setWahaSessions] = useState<Array<{ name: string; status?: string }>>([])
  const [wahaGroups, setWahaGroups] = useState<Array<{ id: string; name: string }>>([])
  const [groupSearch, setGroupSearch] = useState('')
  const [isGroupsLoading, setIsGroupsLoading] = useState(false)
  const [posterPreviewTick, setPosterPreviewTick] = useState(Date.now())

  /** Tailwind `md` (768px): tablet + desktop — horizontal sheet; below = mobile slide-up */
  const [scheduleCalendarWideLayout, setScheduleCalendarWideLayout] = useState(false)
  useLayoutEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setScheduleCalendarWideLayout(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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
    titleType === 'active_profile_unverified_followup' ||
    titleType === 'active_verified_no_autodebit_followup' ||
    titleType === 'gold_poster'

  const filteredItems = items.filter((item) => {
    const isGold = normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)
    return activeTab === 'group' ? isGold : !isGold
  })

  const pendingScheduleItems = useMemo(
    () => items.filter((i) => i.status === 'pending'),
    [items]
  )

  const pendingByLocalDay = useMemo(() => {
    const map = new Map<string, ScheduledMessage[]>()
    for (const item of pendingScheduleItems) {
      const isGold =
        normalizedScheduledTitle(item.title) === normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER)
      if (activeTab === 'group' ? !isGold : isGold) continue
      const k = localDateKeyFromIso(item.scheduled_at)
      if (!k) continue
      const arr = map.get(k) ?? []
      arr.push(item)
      map.set(k, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    }
    return map
  }, [pendingScheduleItems, activeTab])

  const yearMonthScheduleCounts = useMemo(() => {
    const y = scheduleCalendarMonth.getFullYear()
    const counts = Array.from({ length: 12 }, () => 0)
    for (const [k, arr] of pendingByLocalDay.entries()) {
      if (!k.startsWith(`${y}-`)) continue
      const monthIndex = Number(k.slice(5, 7)) - 1
      if (monthIndex >= 0 && monthIndex < 12) counts[monthIndex] += arr.length
    }
    return counts
  }, [pendingByLocalDay, scheduleCalendarMonth])

  const scheduleCalendarCells = useMemo(() => {
    const y = scheduleCalendarMonth.getFullYear()
    const m = scheduleCalendarMonth.getMonth()
    return buildMonthGridCells(y, m)
  }, [scheduleCalendarMonth])

  useEffect(() => {
    if (!scheduleCalendarOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setScheduleCalendarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scheduleCalendarOpen])

  const audienceFetchKey = useMemo(() => {
    if (!scheduleCalendarOpen) return null
    if (scheduleViewMode === 'day') return scheduleCalendarSelectedKey || todayLocalDateKey()
    return scheduleCalendarSelectedKey
  }, [scheduleCalendarOpen, scheduleViewMode, scheduleCalendarSelectedKey])

  useEffect(() => {
    if (!audienceFetchKey) {
      setAudiencePreview(null)
      setAudiencePreviewError(null)
      setAudiencePreviewLoading(false)
      return
    }
    let cancelled = false
    setAudiencePreviewLoading(true)
    setAudiencePreviewError(null)
    ;(async () => {
      try {
        const res = await fetch(
          `/api/automated-messages/audience-preview?date=${encodeURIComponent(audienceFetchKey)}`,
          { cache: 'no-store', credentials: 'same-origin' }
        )
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'Failed to load audience preview')
        if (!cancelled) setAudiencePreview(json as AutomationAudiencePreview)
      } catch (e: unknown) {
        if (!cancelled) setAudiencePreviewError(e instanceof Error ? e.message : 'Preview failed')
      } finally {
        if (!cancelled) setAudiencePreviewLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [audienceFetchKey])

  useEffect(() => {
    if (!scheduleCalendarOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [scheduleCalendarOpen])

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
    const loadTemplateDefaults = async () => {
      try {
        const res = await fetch('/api/automation/templates', { cache: 'no-store' })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json?.templates || typeof json.templates !== 'object') return
        setDefaultTemplates({
          birthday:
            typeof json.templates.birthday === 'string'
              ? json.templates.birthday
              : DEFAULT_AUTOMATION_TEMPLATES.birthday,
          inactive_followup:
            typeof json.templates.inactive_followup === 'string'
              ? json.templates.inactive_followup
              : DEFAULT_AUTOMATION_TEMPLATES.inactive_followup,
          free_followup:
            typeof json.templates.free_followup === 'string'
              ? json.templates.free_followup
              : DEFAULT_AUTOMATION_TEMPLATES.free_followup,
          active_profile_unverified_followup:
            typeof json.templates.active_profile_unverified_followup === 'string'
              ? json.templates.active_profile_unverified_followup
              : DEFAULT_AUTOMATION_TEMPLATES.active_profile_unverified_followup,
          active_verified_no_autodebit_followup:
            typeof json.templates.active_verified_no_autodebit_followup === 'string'
              ? json.templates.active_verified_no_autodebit_followup
              : DEFAULT_AUTOMATION_TEMPLATES.active_verified_no_autodebit_followup,
        })
      } catch {
        // Keep hardcoded fallbacks.
      }
    }
    loadTemplateDefaults()
  }, [])

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
      message: defaultTemplates.birthday,
      scheduled_at: getDefaultScheduleTimePlus3Minutes(),
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
    setForm({
      title: SCHEDULED_TITLE_GOLD_PRICE_POSTER,
      phone: '',
      message: 'Assalamualaikum & salam sejahtera.\nIni update terkini harga buyback Public Gold hari ini.',
      scheduled_at: getDefaultScheduleTimePlus3Minutes(),
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
    else if (lower === 'active account profile-unverified follow-up') {
      inferredType = 'active_profile_unverified_followup'
    }
    else if (lower === 'active account verified no-autodebit follow-up') {
      inferredType = 'active_verified_no_autodebit_followup'
    }
    else if (lower === 'gold price poster') inferredType = 'gold_poster'
    else if (lower.startsWith('profile')) inferredType = 'profile'
    else if (lower.includes('skde')) inferredType = 'skde'
    else if (lower === 'gap') inferredType = 'gap'

    // set now as scheduled_at
    let scheduledValue = new Date().toISOString();
    if (item.scheduled_at) {
      const d = new Date(item.scheduled_at)
      if (!Number.isNaN(d.getTime())) {
        if (
          inferredType === 'birthday' ||
          inferredType === 'inactive_followup' ||
          inferredType === 'free_followup' ||
          inferredType === 'active_profile_unverified_followup' ||
          inferredType === 'active_verified_no_autodebit_followup' ||
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
    if (!confirm('Delete this scheduled message? This action cannot be undone.')) return
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
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="text-xl font-semibold text-slate-900">Automated WhatsApp Messages</h1>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="View schedule on calendar"
                onClick={() => {
                  const d = new Date()
                  d.setDate(1)
                  d.setHours(12, 0, 0, 0)
                  setScheduleCalendarMonth(d)
                  setScheduleViewMode('month')
                  setScheduleCalendarSelectedKey(todayLocalDateKey())
                  setScheduleCalendarWideLayout(window.matchMedia('(min-width: 768px)').matches)
                  setScheduleCalendarOpen(true)
                }}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <button
                onClick={activeTab === 'group' ? openCreateGoldPoster : openCreate}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {activeTab === 'group' ? 'Schedule poster' : 'Schedule message'}
              </button>
            </div>
          </div>
          <div className="mb-4 inline-flex rounded-lg border border-slate-200 p-1 bg-slate-50">
            <button
              onClick={() => setActiveTab('personal')}
              className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'personal' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Personal
            </button>
            <button
              onClick={() => setActiveTab('group')}
              className={`px-3 py-1.5 text-sm rounded-md ${activeTab === 'group' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
            >
              Group
            </button>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            {activeTab === 'group' ? (
              <>
                Schedule daily Public Gold buyback poster sends to one or more WAHA groups. Image is sent first, then your text message.
              </>
            ) : (
              <>
                Create scheduled WhatsApp messages for specific phone numbers, or broadcast automations (birthday, inactive
                follow-up, free-account follow-up, active-profile-unverified follow-up) that run daily at the time you set. Templates support variables like{' '}
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
                {activeTab === 'group' ? 'No scheduled gold poster yet.' : 'No scheduled messages yet.'}
              </p>
              <button
                onClick={activeTab === 'group' ? openCreateGoldPoster : openCreate}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {activeTab === 'group' ? 'Schedule your first poster' : 'Schedule your first message'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl"
                >
                  {(() => {
                    const isEditableRecurring =
                      item.status === 'pending' || isBroadcastScheduledTitle(item.title)
                    return (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900">
                              {item.title || 'Untitled'}
                            </span>
                            <span
                              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${item.status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : item.status === 'sent'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                                }`}
                            >
                              {item.status.toUpperCase()}
                            </span>
                            {isEditableRecurring && item.is_enable === false && (
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
                          {isEditableRecurring && (
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
                            </>
                          )}
                          <button
                            onClick={() => handleDelete(item.id)}
                            disabled={isDeleting === item.id}
                            className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isDeleting === item.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Create / Edit Modal */}
      <AnimatePresence>
        {(isCreating || editing) && (
          <motion.div
            key="automated-messages-form"
            role="presentation"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="automated-message-form-title"
              className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              onClick={(e) => e.stopPropagation()}
            >
            <div className="p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <h2 id="automated-message-form-title" className="text-xl font-semibold text-slate-900 pr-2">
                  {editing ? 'Edit scheduled message' : 'Schedule message'}
                </h2>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={closeModal}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Close"
                  title="Close"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                  <div className="flex flex-col gap-2">
                    {activeTab === 'group' && isCreating && !editing ? (
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
                              return {
                                ...current,
                                title: SCHEDULED_TITLE_BIRTHDAY,
                                message: defaultTemplates.birthday,
                              }
                            if (value === 'inactive_followup')
                              return {
                                ...current,
                                title: SCHEDULED_TITLE_INACTIVE_FOLLOWUP,
                                message: defaultTemplates.inactive_followup,
                              }
                            if (value === 'free_followup')
                              return {
                                ...current,
                                title: SCHEDULED_TITLE_FREE_FOLLOWUP,
                                message: defaultTemplates.free_followup,
                              }
                            if (value === 'active_profile_unverified_followup')
                              return {
                                ...current,
                                title: SCHEDULED_TITLE_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP,
                                message: defaultTemplates.active_profile_unverified_followup,
                              }
                            if (value === 'active_verified_no_autodebit_followup')
                              return {
                                ...current,
                                title: SCHEDULED_TITLE_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP,
                                message: defaultTemplates.active_verified_no_autodebit_followup,
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
                          value="active_profile_unverified_followup"
                          disabled={isBroadcastTitleOngoing(SCHEDULED_TITLE_ACTIVE_PROFILE_UNVERIFIED_FOLLOWUP)}
                        >
                          Active account profile-unverified follow-up (monthly purchase)
                        </option>
                        <option
                          value="active_verified_no_autodebit_followup"
                          disabled={isBroadcastTitleOngoing(SCHEDULED_TITLE_ACTIVE_VERIFIED_NO_AUTODEBIT_FOLLOWUP)}
                        >
                          Active account verified no-autodebit follow-up
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
                        <option disabled value="skde">SKDE (coming soon)</option>
                        <option disabled value="gap">GAP (coming soon)</option>
                        {/* <option value="customer">Customer (custom title)</option> */}
                      </select>
                    )}

                    {(titleType === 'inactive_followup' ||
                      titleType === 'free_followup' ||
                      titleType === 'active_profile_unverified_followup' ||
                      titleType === 'active_verified_no_autodebit_followup') && (
                        <p className="text-xs text-slate-500 mt-2">
                          Auto-send logic: this automation will check customers daily (Malaysia date) and
                          send when the customer matches the selected rule:
                          {titleType === 'inactive_followup'
                            ? ' same month/day as their Last Purchase Date (inactive)'
                            : titleType === 'free_followup'
                              ? ' same month/day as their Date Register (or record created date) (free)'
                              : titleType === 'active_profile_unverified_followup'
                                ? ' active account with purchase in current month and "Profile Verified" = "No"'
                                : ' active account with purchase in current month, "Profile Verified" = "Yes", and "Direct Debit Subscription" = "No"'}.
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
                      className={`relative inline-flex h-6 w-[-webkit-fill-available] items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${form.is_enable ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.is_enable ? 'translate-x-6' : 'translate-x-0'
                          }`}
                      />
                    </button>

                  </div>
                </div>

                {(titleType === 'inactive_followup' ||
                  titleType === 'free_followup' ||
                  titleType === 'active_profile_unverified_followup' ||
                  titleType === 'active_verified_no_autodebit_followup') && (
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
                          className={`relative inline-flex h-6 w-[-webkit-fill-available] items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${form.warmup_enabled ? 'bg-blue-600' : 'bg-slate-300'
                            }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${form.warmup_enabled ? 'translate-x-6' : 'translate-x-0'
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
                    placeholder={defaultTemplates.birthday}
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
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {scheduleCalendarOpen && (
          <motion.div
            key="schedule-calendar-fullscreen"
            className="fixed inset-0 z-[60] flex flex-col bg-slate-50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="schedule-calendar-title"
            initial={
              scheduleCalendarWideLayout
                ? { x: '100vw', y: 0, opacity: 1 }
                : { x: 0, y: '100%', opacity: 1 }
            }
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={
              scheduleCalendarWideLayout
                ? { x: '100vw', y: 0, opacity: 1 }
                : { x: 0, y: '100%', opacity: 1 }
            }
            transition={{ type: 'tween', duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
          >
          <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <h2 id="schedule-calendar-title" className="text-lg font-semibold text-slate-900">
                Schedule calendar
              </h2>
              <p className="mt-0.5 text-xs text-slate-600">
                Pending <strong>{activeTab === 'group' ? 'group' : 'personal'}</strong> automations · local dates
              </p>
            </div>
            <div
              className="flex rounded-xl border border-slate-200 bg-slate-50 p-1"
              role="tablist"
              aria-label="Calendar view"
            >
              {(['day', 'month', 'year'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={scheduleViewMode === mode}
                  onClick={() => {
                    setScheduleViewMode(mode)
                    if (mode === 'day' && !scheduleCalendarSelectedKey) {
                      setScheduleCalendarSelectedKey(todayLocalDateKey())
                    }
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                    scheduleViewMode === mode
                      ? 'bg-white text-slate-900 shadow'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="Close calendar"
              onClick={() => setScheduleCalendarOpen(false)}
              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {scheduleViewMode === 'year' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-4">
                <div className="mx-auto mb-4 flex w-full max-w-4xl items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleCalendarMonth((d) => new Date(d.getFullYear() - 1, d.getMonth(), 1))
                      setScheduleCalendarSelectedKey(null)
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    ← {scheduleCalendarMonth.getFullYear() - 1}
                  </button>
                  <p className="text-base font-semibold text-slate-900">{scheduleCalendarMonth.getFullYear()}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleCalendarMonth((d) => new Date(d.getFullYear() + 1, d.getMonth(), 1))
                      setScheduleCalendarSelectedKey(null)
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    {scheduleCalendarMonth.getFullYear() + 1} →
                  </button>
                </div>
                <div className="mx-auto grid w-full max-w-4xl grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {CALENDAR_MONTH_NAMES.map((name, mi) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setScheduleCalendarMonth(new Date(scheduleCalendarMonth.getFullYear(), mi, 1))
                        setScheduleViewMode('month')
                        setScheduleCalendarSelectedKey(null)
                      }}
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
                    >
                      <p className="text-sm font-semibold text-slate-900">{name}</p>
                      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
                        {yearMonthScheduleCounts[mi]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">pending runs</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {scheduleViewMode === 'month' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="shrink-0 border-b border-slate-200 bg-white px-4 py-3">
                  <div className="mx-auto flex max-w-5xl items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleCalendarMonth((d) => {
                          const x = new Date(d)
                          x.setMonth(x.getMonth() - 1)
                          return x
                        })
                        setScheduleCalendarSelectedKey(null)
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      ←
                    </button>
                    <p className="text-center text-sm font-semibold text-slate-900">
                      {scheduleCalendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' })}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setScheduleCalendarMonth((d) => {
                          const x = new Date(d)
                          x.setMonth(x.getMonth() + 1)
                          return x
                        })
                        setScheduleCalendarSelectedKey(null)
                      }}
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      →
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="mx-auto max-w-5xl">
                    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((wd) => (
                        <div key={wd} className="bg-slate-50 py-2">
                          {wd}
                        </div>
                      ))}
                      {scheduleCalendarCells.map((day, idx) => {
                        const y = scheduleCalendarMonth.getFullYear()
                        const m = scheduleCalendarMonth.getMonth()
                        const dateKey =
                          day != null
                            ? `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            : null
                        const dayItems = dateKey ? pendingByLocalDay.get(dateKey) ?? [] : []
                        const isSelected = dateKey != null && scheduleCalendarSelectedKey === dateKey
                        return (
                          <button
                            key={idx}
                            type="button"
                            disabled={day == null}
                            onClick={() => {
                              if (dateKey) setScheduleCalendarSelectedKey(dateKey)
                            }}
                            className={`min-h-[4.5rem] bg-white p-1.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 disabled:cursor-default disabled:bg-slate-50/80 sm:min-h-[5.5rem] ${
                              isSelected ? 'ring-2 ring-inset ring-blue-500' : 'hover:bg-slate-50'
                            }`}
                          >
                            {day != null ? (
                              <>
                                <span className="block text-sm font-semibold text-slate-900">{day}</span>
                                <div className="mt-1 flex flex-wrap gap-0.5">
                                  {dayItems.slice(0, 4).map((it) => (
                                    <span
                                      key={it.id}
                                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${scheduleKindMeta(it.title).bar}`}
                                      title={it.title || 'Scheduled'}
                                    />
                                  ))}
                                  {dayItems.length > 4 ? (
                                    <span className="text-[10px] font-medium text-slate-500">+{dayItems.length - 4}</span>
                                  ) : null}
                                </div>
                              </>
                            ) : (
                              <span className="sr-only">empty</span>
                            )}
                          </button>
                        )
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-pink-500" /> Birthday
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-orange-500" /> Inactive
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-violet-500" /> Free account
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-sky-500" /> Profile unverified
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-teal-500" /> No autodebit
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-amber-500" /> Gold poster
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full bg-slate-500" /> Other
                      </span>
                    </div>

                    {scheduleCalendarSelectedKey ? (
                      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-slate-900">
                          {new Date(scheduleCalendarSelectedKey + 'T12:00:00').toLocaleDateString(undefined, {
                            weekday: 'long',
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </h3>
                        {(pendingByLocalDay.get(scheduleCalendarSelectedKey) ?? []).length === 0 ? (
                          <p className="mt-2 text-sm text-slate-600">No pending schedules on this day.</p>
                        ) : (
                          <ul className="mt-3 space-y-3">
                            {(pendingByLocalDay.get(scheduleCalendarSelectedKey) ?? []).map((it) => {
                              const meta = scheduleKindMeta(it.title)
                              const msgPreview = it.message.startsWith(WARMUP_MESSAGE_MARKER)
                                ? it.message.slice(WARMUP_MESSAGE_MARKER.length)
                                : it.message
                              return (
                                <li
                                  key={it.id}
                                  className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-3"
                                >
                                  <span className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${meta.bar}`} aria-hidden />
                                  <div className="min-w-0 flex-1">
                                    <p className="font-medium text-slate-900">{it.title || 'Untitled'}</p>
                                    <p className="text-xs text-slate-500">
                                      {meta.shortLabel}
                                      {it.is_enable === false ? (
                                        <span className="ml-2 font-semibold text-amber-700">· Disabled</span>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 text-xs text-slate-600">
                                      {new Date(it.scheduled_at).toLocaleString(undefined, {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })}
                                      {normalizedScheduledTitle(it.title) !==
                                        normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER) &&
                                      it.phone ? (
                                        <span className="ml-2 font-mono">{it.phone}</span>
                                      ) : null}
                                    </p>
                                    <p className="mt-1 line-clamp-2 text-xs text-slate-600">{msgPreview}</p>
                                  </div>
                                  <div className="flex shrink-0 flex-col gap-1">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        openEdit(it)
                                        setScheduleCalendarOpen(false)
                                      }}
                                      className="rounded-lg px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                    >
                                      Edit
                                    </button>
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                        <ScheduleAudienceSection
                          preview={audiencePreview}
                          loading={audiencePreviewLoading}
                          error={audiencePreviewError}
                          onOpenCustomer={(id) => openCustomerById(id)}
                        />
                      </div>
                    ) : (
                      <p className="mt-4 text-center text-sm text-slate-500">Select a day for details and recipient preview.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {scheduleViewMode === 'day' && (
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:w-52 lg:flex-col lg:items-stretch lg:justify-start lg:gap-3 lg:border-b-0 lg:border-r">
                  <button
                    type="button"
                    onClick={() =>
                      setScheduleCalendarSelectedKey(
                        shiftDateKey(scheduleCalendarSelectedKey || todayLocalDateKey(), -1)
                      )
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    ← Prev day
                  </button>
                  <p className="text-center text-sm font-semibold text-slate-900 lg:text-left">
                    {new Date((scheduleCalendarSelectedKey || todayLocalDateKey()) + 'T12:00:00').toLocaleDateString(
                      undefined,
                      { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() =>
                      setScheduleCalendarSelectedKey(
                        shiftDateKey(scheduleCalendarSelectedKey || todayLocalDateKey(), 1)
                      )
                    }
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Next day →
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleCalendarSelectedKey(todayLocalDateKey())}
                    className="hidden rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 lg:block"
                  >
                    Today
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <div className="mx-auto max-w-3xl">
                    <button
                      type="button"
                      onClick={() => setScheduleCalendarSelectedKey(todayLocalDateKey())}
                      className="mb-3 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow hover:bg-blue-700 lg:hidden"
                    >
                      Jump to today
                    </button>
                    {(pendingByLocalDay.get(scheduleCalendarSelectedKey || todayLocalDateKey()) ?? []).length ===
                    0 ? (
                      <p className="text-sm text-slate-600">No pending schedules on this day.</p>
                    ) : (
                      <ul className="space-y-3">
                        {(pendingByLocalDay.get(scheduleCalendarSelectedKey || todayLocalDateKey()) ?? []).map(
                          (it) => {
                            const meta = scheduleKindMeta(it.title)
                            const msgPreview = it.message.startsWith(WARMUP_MESSAGE_MARKER)
                              ? it.message.slice(WARMUP_MESSAGE_MARKER.length)
                              : it.message
                            return (
                              <li
                                key={it.id}
                                className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                              >
                                <span className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${meta.bar}`} aria-hidden />
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-slate-900">{it.title || 'Untitled'}</p>
                                  <p className="text-xs text-slate-500">{meta.shortLabel}</p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    {new Date(it.scheduled_at).toLocaleString(undefined, {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}
                                    {normalizedScheduledTitle(it.title) !==
                                      normalizedScheduledTitle(SCHEDULED_TITLE_GOLD_PRICE_POSTER) &&
                                    it.phone ? (
                                      <span className="ml-2 font-mono">{it.phone}</span>
                                    ) : null}
                                  </p>
                                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{msgPreview}</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    openEdit(it)
                                    setScheduleCalendarOpen(false)
                                  }}
                                  className="shrink-0 self-start rounded-lg px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                                >
                                  Edit
                                </button>
                              </li>
                            )
                          }
                        )}
                      </ul>
                    )}
                    <ScheduleAudienceSection
                      preview={audiencePreview}
                      loading={audiencePreviewLoading}
                      error={audiencePreviewError}
                      onOpenCustomer={(id) => openCustomerById(id)}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
