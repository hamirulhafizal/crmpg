'use client'

/**
 * Shared create/edit customer dialog (Details, Follow-up, Tags).
 * Used from the customers workspace and from global entry points (e.g. automated-messages).
 */

import { useAuth } from '@/app/contexts/auth-context'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import CustomerLocationCombobox from '@/app/components/CustomerLocationCombobox'
import { getAccountStatusLabel } from '@/app/lib/customer-account-status'
import {
  FOLLOW_UP_CHANNELS,
  FOLLOW_UP_OUTCOMES,
  FOLLOW_UP_TOPICS,
  DEFAULT_MAX_TOUCHES_PER_WEEK,
  getChannelLabel,
  getTopicCooldownDays,
  getTopicLabel,
  type FollowUpActivityRow,
  type FollowUpChannel,
} from '@/app/lib/customer-follow-up-activities'
import {
  saveFollowUpResume,
  storedFollowUpResumeFromApi,
  type StoredFollowUpResume,
} from '@/app/lib/follow-up-resume'
import { computeAgeFromDob } from '@/app/lib/customer-dob'

/** Above full-screen shells (e.g. schedule calendar z-[60]) and typical z-50 modals. */
const Z_CUSTOMER_MODAL_OVERLAY = 'z-[1000]'
const Z_CUSTOMER_MODAL_NESTED = 'z-[1010]'
const Z_CUSTOMER_MODAL_TOAST = 'z-[1020]'

function defaultFollowUpOccurredAtLocal(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

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

function originalDataFieldAsInputValue(
  data: Record<string, unknown> | null | undefined,
  key: string
): string {
  const v = data?.[key]
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  return ''
}

const parseProfileVerified = (originalData: unknown): boolean | null => {
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

/** WhatsApp save name: `{sender} - {pgCode}` (matches common CRM convention). */
function saveNameFromSenderAndPg(senderName: string, pgCode: string): string {
  const sender = senderName.trim()
  const pg = pgCode.trim()
  if (!sender && !pg) return ''
  if (!sender) return pg
  if (!pg) return sender
  return `${sender} - ${pg}`
}

export interface Customer {
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
  original_data: Record<string, unknown> | null
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

interface CustomerLabel {
  id?: string | number
  name?: string
  color?: number
  colorHex?: string
}

interface ChatHistoryMessage {
  id: string
  text: string
  timestamp: number | null
  fromMe: boolean
}

export type CustomerEditModalTab = 'details' | 'follow_up' | 'tags'

export type CustomerEditModalShellProps = {
  open: boolean
  isCreating: boolean
  customerId: string | null
  /** Snapshot when parent opens the modal; merged with API fetch for edit. */
  initialCustomer: Partial<Customer> | null
  /** Tab to show when the dialog opens (e.g. deep-link to Follow-up). */
  initialTab?: CustomerEditModalTab
  overlayZIndexClassName?: string
  /** When set, follow-up "call" logs sync follow-up resume + bookmark like the customers page. */
  followUpResumeContext?: {
    accountStatusFilter: string
    page: number
    viewMode: 'paginated' | 'all'
  } | null
  onResumeSynced?: (stored: StoredFollowUpResume) => void
  onClose: () => void
  onSaved: () => void
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

export function CustomerEditModalShell({
  open,
  isCreating,
  customerId,
  initialCustomer,
  initialTab = 'details',
  overlayZIndexClassName,
  followUpResumeContext,
  onResumeSynced,
  onClose,
  onSaved,
}: CustomerEditModalShellProps) {
  const { user } = useAuth()
  const isMountedRef = useRef(true)

  const [draft, setDraft] = useState<Partial<Customer> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  const [customerModalTab, setCustomerModalTab] = useState<CustomerEditModalTab>('details')
  const [customerLabels, setCustomerLabels] = useState<CustomerLabel[]>([])
  const [labelsLoading, setLabelsLoading] = useState(false)
  const [labelsError, setLabelsError] = useState<string | null>(null)
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null)
  const [profileImageLoading, setProfileImageLoading] = useState(false)
  const [profileImageError, setProfileImageError] = useState<string | null>(null)

  const [tagCatalog, setTagCatalog] = useState<{
    categories: TagCategoryDto[]
    tags: TagDto[]
  } | null>(null)
  const [tagCatalogLoading, setTagCatalogLoading] = useState(false)
  const [crmSelectedTagIds, setCrmSelectedTagIds] = useState<string[]>([])
  const [crmTagsLoading, setCrmTagsLoading] = useState(false)

  const [analyzeAiLoading, setAnalyzeAiLoading] = useState(false)
  const [analyzeAiError, setAnalyzeAiError] = useState<string | null>(null)
  const [analyzeAiNotice, setAnalyzeAiNotice] = useState<string | null>(null)
  const [chatHistory, setChatHistory] = useState<ChatHistoryMessage[]>([])
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false)
  const [chatHistoryError, setChatHistoryError] = useState<string | null>(null)
  const [chatHistoryDialogOpen, setChatHistoryDialogOpen] = useState(false)
  const [chatHistoryDialogLoading, setChatHistoryDialogLoading] = useState(false)

  const [followUpActivities, setFollowUpActivities] = useState<FollowUpActivityRow[]>([])
  const [followUpLimits, setFollowUpLimits] = useState<{
    touchesLast7Days: number
    maxTouchesPerWeek: number
  } | null>(null)
  const [followUpLoading, setFollowUpLoading] = useState(false)
  const [followUpSubmitting, setFollowUpSubmitting] = useState(false)
  const [followUpError, setFollowUpError] = useState<string | null>(null)
  const [followUpTopic, setFollowUpTopic] = useState('general_check_in')
  const [followUpChannel, setFollowUpChannel] = useState<FollowUpChannel>('call')
  const [followUpOutcome, setFollowUpOutcome] = useState('')
  const [followUpNotes, setFollowUpNotes] = useState('')
  const [followUpOccurredAt, setFollowUpOccurredAt] = useState(defaultFollowUpOccurredAtLocal)
  const [followUpCountsQuota, setFollowUpCountsQuota] = useState(true)

  const [isPostingCustomer, setIsPostingCustomer] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [toasts, setToasts] = useState<Array<{ id: number; type: 'success' | 'error'; text: string }>>([])

  const [isNarrowViewport, setIsNarrowViewport] = useState(false)

  const pushToast = useCallback((type: 'success' | 'error', text: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((prev) => [...prev, { id, type, text }])
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4500)
  }, [])

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const q = () => setIsNarrowViewport(typeof window !== 'undefined' && window.innerWidth < 768)
    q()
    window.addEventListener('resize', q)
    return () => window.removeEventListener('resize', q)
  }, [])

  useEffect(() => {
    if (open) {
      setCustomerModalTab(initialTab)
    }
  }, [open, initialTab])

  useEffect(() => {
    if (isCreating && customerModalTab === 'follow_up') {
      setCustomerModalTab('details')
    }
  }, [isCreating, customerModalTab])

  useEffect(() => {
    if (!open || !user) return
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
  }, [open, user])

  useEffect(() => {
    if (!customerId && !isCreating) {
      setFollowUpActivities([])
      setFollowUpLimits(null)
      setFollowUpError(null)
      setFollowUpTopic('general_check_in')
      setFollowUpChannel('call')
      setFollowUpOutcome('')
      setFollowUpNotes('')
      setFollowUpOccurredAt(defaultFollowUpOccurredAtLocal())
      setFollowUpCountsQuota(true)
    }
  }, [customerId, isCreating])

  const resetShellState = useCallback(() => {
    setDraft(null)
    setLoadError(null)
    setModalLoading(false)
    setCustomerModalTab('details')
    setCustomerLabels([])
    setLabelsError(null)
    setProfileImageUrl(null)
    setProfileImageError(null)
    setCrmSelectedTagIds([])
    setAnalyzeAiError(null)
    setAnalyzeAiNotice(null)
    setChatHistory([])
    setChatHistoryError(null)
    setChatHistoryDialogOpen(false)
    setFollowUpActivities([])
    setFollowUpLimits(null)
    setFollowUpError(null)
    setSaveError(null)
  }, [])

  useEffect(() => {
    if (!open || !isCreating) return
    setLoadError(null)
    setModalLoading(false)
    const base = initialCustomer && typeof initialCustomer === 'object' ? initialCustomer : {}
    setDraft({
      ...base,
      segment_attributes:
        base.segment_attributes && typeof base.segment_attributes === 'object'
          ? { ...base.segment_attributes }
          : {},
    })
  }, [open, isCreating, initialCustomer])

  useEffect(() => {
    if (!open || isCreating || !customerId) return

    let cancelled = false
    ;(async () => {
      setModalLoading(true)
      setLoadError(null)
      try {
        const res = await fetch(`/api/customers/${customerId}`, { cache: 'no-store', credentials: 'same-origin' })
        const data = (await res.json().catch(() => null)) as Partial<Customer> | null
        if (!res.ok || !data?.id) {
          throw new Error((data as { error?: string })?.error || 'Failed to load customer')
        }
        if (!cancelled) {
          setDraft({
            ...data,
            original_data:
              normalizeCustomerOriginalData(data.original_data) ??
              (data.original_data as Record<string, unknown> | null),
            segment_attributes:
              data.segment_attributes && typeof data.segment_attributes === 'object'
                ? { ...data.segment_attributes }
                : {},
          })
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setDraft(null)
          setLoadError(e instanceof Error ? e.message : 'Failed to load customer')
        }
      } finally {
        if (!cancelled) setModalLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, isCreating, customerId])

  const handleModalDismiss = useCallback(() => {
    setChatHistoryDialogOpen(false)
    onClose()
  }, [onClose])

  const fetchCrmTagAssignments = async (cid: string) => {
    setCrmTagsLoading(true)
    try {
      const response = await fetch(`/api/customers/${cid}/crm-tags`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to load CRM tags')
      }
      const ids = (result.assignments || []).map((a: { tag_id: string }) => a.tag_id)
      setCrmSelectedTagIds(ids)
    } catch {
      setCrmSelectedTagIds([])
    } finally {
      setCrmTagsLoading(false)
    }
  }

  const handleAnalyzeAi = async () => {
    if (!customerId) return
    setAnalyzeAiLoading(true)
    setAnalyzeAiError(null)
    setAnalyzeAiNotice(null)
    try {
      const res = await fetch(`/api/customers/${customerId}/analyze-tags`, {
        method: 'POST',
        credentials: 'same-origin',
      })
      const raw = await res.json().catch(() => ({}))
      if (!res.ok) {
        const body = raw as { error?: string; hint?: string; debug?: unknown }
        const hint = typeof body.hint === 'string' ? ` ${body.hint}` : ''
        throw new Error((typeof body.error === 'string' ? body.error : 'Analyze failed') + hint)
      }
      const data = raw as {
        rationale_ms?: string
        rationale_en?: string
        applied_tag_ids?: string[]
      }
      await fetchCrmTagAssignments(customerId)
      const ms = typeof data.rationale_ms === 'string' ? data.rationale_ms.trim() : ''
      const en = typeof data.rationale_en === 'string' ? data.rationale_en.trim() : ''
      const n = Number(data.applied_tag_ids?.length)
      const summary =
        ms || en
          ? [ms, en].filter(Boolean).join(' — ')
          : Number.isFinite(n)
            ? `Applied ${n} tag(s) from chat analysis.`
            : 'Analysis complete.'
      setAnalyzeAiNotice(summary)
    } catch (e: unknown) {
      setAnalyzeAiError(e instanceof Error ? e.message : 'Analyze failed')
    } finally {
      setAnalyzeAiLoading(false)
    }
  }

  const toggleCrmTag = (tagId: string, category: TagCategoryDto) => {
    if (!tagCatalog) return
    setCrmSelectedTagIds((prev) => {
      const selected = new Set(prev)
      const tagsInCategory = tagCatalog.tags.filter((t) => t.category_id === category.id)
      const idsInCat = new Set(tagsInCategory.map((t) => t.id))

      if (!category.allows_multiple) {
        if (selected.has(tagId)) {
          selected.delete(tagId)
        } else {
          for (const id of idsInCat) selected.delete(id)
          selected.add(tagId)
        }
        return Array.from(selected)
      }

      if (selected.has(tagId)) selected.delete(tagId)
      else selected.add(tagId)
      return Array.from(selected)
    })
  }

  async function fetchCustomerLabels(cid: string) {
    setLabelsLoading(true)
    setLabelsError(null)
    setCustomerLabels([])
    try {
      const response = await fetch(`/api/customers/${cid}/labels`, {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch customer labels')
      }
      setCustomerLabels(Array.isArray(result.labels) ? result.labels : [])
    } catch (err: unknown) {
      setLabelsError(err instanceof Error ? err.message : 'Failed to fetch customer labels')
    } finally {
      setLabelsLoading(false)
    }
  }

  async function fetchCustomerProfileImage(cid: string) {
    setProfileImageLoading(true)
    setProfileImageError(null)
    setProfileImageUrl(null)
    try {
      const response = await fetch(`/api/customers/${cid}/profile-picture`, {
        cache: 'no-store',
      })
      const result = await response.json()
      if (!response.ok) {
        throw new Error(result.error || 'Failed to fetch customer profile image')
      }
      setProfileImageUrl(typeof result.profilePictureURL === 'string' ? result.profilePictureURL : null)
    } catch (err: unknown) {
      setProfileImageError(err instanceof Error ? err.message : 'Failed to fetch customer profile image')
    } finally {
      setProfileImageLoading(false)
    }
  }

  async function fetchCustomerChatHistory(cid: string, limit = 80, forDialog = false) {
    if (forDialog) setChatHistoryDialogLoading(true)
    else setChatHistoryLoading(true)
    setChatHistoryError(null)
    try {
      const response = await fetch(`/api/customers/${cid}/chat-history?limit=${limit}`, {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const hint = typeof result.hint === 'string' ? ` ${result.hint}` : ''
        throw new Error((typeof result.error === 'string' ? result.error : 'Failed to fetch chat history') + hint)
      }
      setChatHistory(Array.isArray(result.messages) ? result.messages : [])
    } catch (err: unknown) {
      setChatHistory([])
      setChatHistoryError(err instanceof Error ? err.message : 'Failed to fetch chat history')
    } finally {
      if (forDialog) setChatHistoryDialogLoading(false)
      else setChatHistoryLoading(false)
    }
  }

  const handleOpenFullChatHistory = async () => {
    if (!customerId) return
    setChatHistoryDialogOpen(true)
    await fetchCustomerChatHistory(customerId, 500, true)
  }

  const fetchFollowUpActivities = useCallback(async (cid: string) => {
    setFollowUpLoading(true)
    setFollowUpError(null)
    setFollowUpActivities([])
    setFollowUpLimits(null)
    try {
      const res = await fetch(`/api/customers/${cid}/follow-up-activities`, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load follow-up log')
      setFollowUpActivities(Array.isArray(json.data) ? json.data : [])
      setFollowUpLimits(
        json.limits && typeof json.limits === 'object'
          ? {
              touchesLast7Days: Number(json.limits.touchesLast7Days) || 0,
              maxTouchesPerWeek: Number(json.limits.maxTouchesPerWeek) || DEFAULT_MAX_TOUCHES_PER_WEEK,
            }
          : null,
      )
    } catch (e: unknown) {
      setFollowUpActivities([])
      setFollowUpLimits(null)
      setFollowUpError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setFollowUpLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open || isCreating || !customerId || modalLoading || !draft?.id) return
    void fetchCustomerLabels(customerId)
    void fetchCrmTagAssignments(customerId)
    void fetchCustomerProfileImage(customerId)
    void fetchCustomerChatHistory(customerId)
    void fetchFollowUpActivities(customerId)
  }, [open, isCreating, customerId, modalLoading, draft?.id, fetchFollowUpActivities])

  const syncFollowUpBookmarkToServer = useCallback(
    async (payload: Omit<StoredFollowUpResume, 'updatedAt'> & { updatedAt?: number }): Promise<boolean> => {
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
          onResumeSynced?.(stored)
        }
        return Boolean(stored)
      } catch {
        return false
      }
    },
    [user, onResumeSynced],
  )

  const handleSubmitFollowUp = async () => {
    if (!customerId) return
    setFollowUpSubmitting(true)
    setFollowUpError(null)
    try {
      const res = await fetch(`/api/customers/${customerId}/follow-up-activities`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: followUpTopic,
          channel: followUpChannel,
          outcome: followUpOutcome.trim() || null,
          notes: followUpNotes.trim() || undefined,
          occurred_at: followUpOccurredAt.trim() || undefined,
          counts_toward_quota: followUpCountsQuota,
          idempotency_key:
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `fu-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Failed to save')
      pushToast('success', 'Follow-up ditambah.')
      setFollowUpNotes('')
      setFollowUpOutcome('')
      setFollowUpOccurredAt(defaultFollowUpOccurredAtLocal())
      await fetchFollowUpActivities(customerId)
      if (
        followUpChannel === 'call' &&
        draft &&
        customerId &&
        followUpResumeContext
      ) {
        saveFollowUpResume({
          customerId,
          saveName: draft.save_name || draft.name || String(draft.pg_code || 'Customer'),
          accountStatusFilter: followUpResumeContext.accountStatusFilter,
          page: followUpResumeContext.page,
          viewMode: followUpResumeContext.viewMode,
        })
        void syncFollowUpBookmarkToServer({
          customerId,
          saveName: draft.save_name || draft.name || String(draft.pg_code || 'Customer'),
          accountStatusFilter: followUpResumeContext.accountStatusFilter,
          page: followUpResumeContext.page,
          viewMode: followUpResumeContext.viewMode,
        })
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save'
      setFollowUpError(msg)
      pushToast('error', msg)
    } finally {
      setFollowUpSubmitting(false)
    }
  }

  const followUpTopicHint = useMemo(() => {
    const last = followUpActivities.find((a) => a.topic === followUpTopic)
    if (!last) return null
    const cd = getTopicCooldownDays(followUpTopic)
    const lastMs = new Date(last.occurred_at).getTime()
    if (!Number.isFinite(lastMs)) return null
    const next = new Date(lastMs + cd * 24 * 60 * 60 * 1000)
    return `Log terakhir topik ini: ${new Date(last.occurred_at).toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}. Cooldown ${cd} hari — log seterusnya selepas ${next.toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}.`
  }, [followUpActivities, followUpTopic])

  const handleSaveEdit = async () => {
    if (!draft || !customerId) return

    setIsPostingCustomer(true)
    setSaveError(null)
    try {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(draft),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update customer')
      }

      const crmRes = await fetch(`/api/customers/${customerId}/crm-tags`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tag_ids: crmSelectedTagIds }),
      })
      const crmJson = await crmRes.json()
      if (!crmRes.ok) {
        throw new Error(crmJson.error || 'Failed to save CRM tags')
      }

      const displayName = draft.save_name || draft.name || 'Customer'
      pushToast('success', `${displayName} saved successfully.`)

      setCrmSelectedTagIds([])
      setCustomerModalTab('details')
      onSaved()
      handleModalDismiss()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update customer'
      setSaveError(msg)
      pushToast('error', msg)
    } finally {
      setIsPostingCustomer(false)
    }
  }

  const handleCreate = async () => {
    if (!draft) return

    setIsPostingCustomer(true)
    setSaveError(null)
    try {
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customers: [draft],
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to create customer')
      }

      const displayName = draft.save_name || draft.name || 'Customer'
      pushToast('success', `${displayName} created successfully.`)
      runConfetti()

      setCustomerModalTab('details')
      onSaved()
      handleModalDismiss()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create customer'
      setSaveError(msg)
      pushToast('error', msg)
    } finally {
      setIsPostingCustomer(false)
    }
  }

  const modalMotionTransition = { type: 'tween' as const, duration: 0.32, ease: [0.22, 1, 0.36, 1] as const }
  const narrow = isNarrowViewport
  const shellEnterExit = narrow
    ? { initial: { y: '100%', opacity: 1 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 1 } }
    : { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
  return (
    <>
      {open
        ? toasts.map((t) => (
        <div
          key={t.id}
          className={`fixed bottom-4 right-4 ${Z_CUSTOMER_MODAL_TOAST} max-w-sm rounded-lg px-4 py-3 text-sm shadow-lg ${
            t.type === 'success' ? 'bg-emerald-700 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {t.text}
        </div>
      ))
        : null}

      <AnimatePresence onExitComplete={() => resetShellState()}>
        {open && (
          <motion.div
            key="customer-edit-modal-shell"
            className={`fixed inset-0 flex flex-col ${overlayZIndexClassName ?? Z_CUSTOMER_MODAL_OVERLAY}`}
            initial={shellEnterExit.initial}
            animate={shellEnterExit.animate}
            exit={shellEnterExit.exit}
            transition={modalMotionTransition}
          >
            {modalLoading && !isCreating ? (
              <div
                key="customer-phase-loading"
                className="flex min-h-0 flex-1 flex-col items-center justify-center bg-black bg-opacity-50 px-4"
                style={{ padding: isNarrowViewport ? 0 : undefined }}
                aria-busy="true"
                aria-live="polite"
              >
          <div
            className="flex w-full max-w-2xl max-h-[90vh] flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-modal-loading-title"
          >
            <div className={`flex min-h-[min(70vh,560px)] flex-col p-6 ${isNarrowViewport ? 'pb-24' : 'pb-6'}`}>
              <span id="customer-modal-loading-title" className="sr-only">
                Loading customer
              </span>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="h-7 w-44 max-w-[55%] rounded-lg bg-slate-200/90 animate-pulse" />
                <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200/90 animate-pulse" />
              </div>
              <div
                className="mb-4 grid gap-1 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1"
                aria-hidden
              >
                <div className="grid grid-cols-3 gap-1">
                  <div className="h-10 rounded-lg bg-white/80 animate-pulse" />
                  <div className="h-10 rounded-lg bg-slate-200/60 animate-pulse" />
                  <div className="h-10 rounded-lg bg-slate-200/60 animate-pulse" />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-4">
                <div className="flex gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-full bg-slate-200/90 animate-pulse" />
                  <div className="min-w-0 flex-1 space-y-2 pt-1">
                    <div className="h-3 w-36 rounded bg-slate-200/90 animate-pulse" />
                    <div className="h-3 w-full max-w-[220px] rounded bg-slate-200/80 animate-pulse" />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="space-y-2">
                      <div className="h-3 w-24 rounded bg-slate-200/90 animate-pulse" />
                      <div className="h-10 w-full rounded-lg bg-slate-200/80 animate-pulse" />
                    </div>
                  ))}
                </div>
                <div className="mt-auto flex justify-end gap-3 border-t border-slate-100 pt-4">
                  <div className="h-10 w-20 rounded-lg bg-slate-200/70 animate-pulse" />
                  <div className="h-10 w-28 rounded-lg bg-slate-200/90 animate-pulse" />
                </div>
              </div>
            </div>
          </div>
              </div>
            ) : loadError && !isCreating ? (
              <div
                key="customer-phase-error"
                className="flex min-h-0 flex-1 flex-col items-center justify-center bg-black/50 p-4"
              >
        <div
          className="max-w-md rounded-2xl bg-white p-6 shadow-xl"
        >
            <p className="text-sm text-red-700">{loadError}</p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
              onClick={handleModalDismiss}
            >
              Close
            </button>
          </div>
              </div>
            ) : draft && !loadError ? (
              <div
                key="customer-phase-form"
                className={`flex min-h-0 flex-1 flex-col bg-black bg-opacity-50 ${isNarrowViewport ? 'p-0' : 'p-4'}`}
              >
          <div
            className="flex min-h-0 flex-1 items-center justify-center"
            onClick={() => {
              if (isPostingCustomer || followUpSubmitting) return
              handleModalDismiss()
            }}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >

              {/* // on mobile and below screen size add padding-bottom 2rem */}
              <div className={`p-6 ${isNarrowViewport ? 'pb-24' : 'pb-6'}`}>
                <div className="mb-4 flex items-center gap-3 justify-between">

                  <h2 className="text-xl font-semibold text-slate-900">
                    {isCreating ? 'Create Customer' : 'Edit Customer'}
                  </h2>

                  <button
                    type="button"
                    disabled={isPostingCustomer || followUpSubmitting}
                    onClick={() => {
                      if (isPostingCustomer || followUpSubmitting) return
                      handleModalDismiss()
                    }}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Close modal"
                    title="Close"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                </div>

                <div
                  role="tablist"
                  aria-label="Customer sections"
                  className={`mb-4 grid gap-1 rounded-xl border border-slate-200 bg-slate-100/90 p-1 ${isCreating ? 'grid-cols-2' : 'grid-cols-3'}`}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customerModalTab === 'details'}
                    onClick={() => setCustomerModalTab('details')}
                    className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-3 ${
                      customerModalTab === 'details'
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Details
                  </button>
                  {!isCreating && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={customerModalTab === 'follow_up'}
                      onClick={() => setCustomerModalTab('follow_up')}
                      className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-3 ${
                        customerModalTab === 'follow_up'
                          ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Follow-up
                    </button>
                  )}
                  <button
                    type="button"
                    role="tab"
                    aria-selected={customerModalTab === 'tags'}
                    onClick={() => setCustomerModalTab('tags')}
                    className={`rounded-lg px-2 py-2.5 text-sm font-semibold transition-all outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:px-3 ${
                      customerModalTab === 'tags'
                        ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/80'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Tags
                  </button>
                </div>

                <AnimatePresence mode="wait">
                {customerModalTab === 'details' && (
                  <motion.div
                    key="customer-tab-details"
                    role="tabpanel"
                    aria-label="Details"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-14 w-14 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shrink-0">
                    {isCreating ? (
                      <div className="h-full w-full flex items-center justify-center text-slate-400">
                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M5.121 17.804A9 9 0 1118.879 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                    ) : profileImageLoading ? (
                      <div className="h-full w-full flex items-center justify-center text-slate-400">
                        <svg
                          className="animate-spin h-5 w-5"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      </div>
                    ) : profileImageUrl ? (
                      <img
                        src={profileImageUrl}
                        alt="Customer WhatsApp profile"
                        className="h-full w-full object-cover"
                        onError={() => {
                          setProfileImageUrl(null)
                          setProfileImageError('Profile image is unavailable')
                        }}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-slate-400">
                        <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.5}
                            d="M5.121 17.804A9 9 0 1118.879 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700">WhatsApp profile image</p>
                    <p className="text-xs text-slate-500">
                      {isCreating
                        ? 'Available after customer is created.'
                        : profileImageError
                          ? profileImageError
                          : profileImageUrl
                            ? 'Loaded from WAHA contact profile.'
                            : 'No profile image found.'}
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Account Status</label>
                  <div
                    className="px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-800"
                    aria-live="polite"
                  >
                    {getAccountStatusLabel(draft)}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Last Purchase Date:{' '}
                    {originalDataFieldAsInputValue(draft.original_data, 'Last Purchase Date') || '-'}
                  </p>
                </div>

                <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 rounded-xl border border-teal-100 bg-teal-50/40 p-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sender Name</label>
                    <input
                      type="text"
                      value={draft.sender_name || ''}
                      onChange={(e) => {
                        const sender_name = e.target.value
                        setDraft({
                          ...draft,
                          sender_name,
                          save_name: saveNameFromSenderAndPg(sender_name, draft.pg_code || ''),
                          is_friend: true,
                        })
                      }}
                      placeholder="e.g. Pn Haszelina, Tn Azamuddin"
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Save Name</label>
                    <input
                      type="text"
                      value={draft.save_name || ''}
                      onChange={(e) => setDraft({ ...draft, save_name: e.target.value })}
                      placeholder="Auto-filled from sender name and PG code"
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Updates automatically when you change Sender Name (format: Name - PG code).
                    </p>
                  </div>

                  <div className="md:col-span-2 flex flex-wrap items-center gap-x-6 gap-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_married}
                        onChange={(e) => setDraft({ ...draft, is_married: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">Married</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!draft.is_friend}
                        onChange={(e) => setDraft({ ...draft, is_friend: e.target.checked })}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">Friend</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={parseProfileVerified(draft.original_data) === true}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            original_data: {
                              ...(draft.original_data || {}),
                              'Profile Verified': e.target.checked ? 'Yes' : 'No',
                            },
                          })
                        }
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-slate-400 rounded"
                      />
                      <span className="text-sm font-medium text-slate-700">Profile verified</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={draft.name || ''}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={draft.email || ''}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={draft.phone || ''}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Date of Birth</label>
                    <input
                      type="date"
                      value={draft.dob || ''}
                      onChange={(e) => {
                        const dob = e.target.value
                        const computedAge = computeAgeFromDob(dob)
                        setDraft({
                          ...draft,
                          dob,
                          ...(computedAge != null ? { age: computedAge } : {}),
                        })
                      }}
                      className="w-full px-3 py-2 text-slate-900 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Gender</label>
                    <select
                      value={draft.gender || ''}
                      onChange={(e) => setDraft({ ...draft, gender: e.target.value })}
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
                      value={draft.ethnicity || ''}
                      onChange={(e) => setDraft({ ...draft, ethnicity: e.target.value })}
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
                      value={draft.location || ''}
                      onChange={(location) => setDraft({ ...draft, location })}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="mt-1 text-xs text-slate-500">Locality / town (Malaysia). Type to search or enter any text.</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">PG Code</label>
                    <input
                      type="text"
                      value={draft.pg_code || ''}
                      onChange={(e) => {
                        const pg_code = e.target.value
                        const sender = draft.sender_name?.trim() ?? ''
                        setDraft({
                          ...draft,
                          pg_code,
                          ...(sender
                            ? { save_name: saveNameFromSenderAndPg(draft.sender_name || '', pg_code) }
                            : {}),
                        })
                      }}
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Rank</label>
                    <input
                      type="text"
                      value={originalDataFieldAsInputValue(draft.original_data, 'Rank')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
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
                      value={originalDataFieldAsInputValue(draft.original_data, 'Branch')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
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
                      value={originalDataFieldAsInputValue(draft.original_data, 'Empire Size')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
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
                      value={originalDataFieldAsInputValue(draft.original_data, 'Parent Name')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
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
                      value={originalDataFieldAsInputValue(draft.original_data, 'Date Register')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
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
                      value={originalDataFieldAsInputValue(draft.original_data, 'Total Frontline')}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          original_data: {
                            ...(draft.original_data || {}),
                            'Total Frontline': e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-500 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>


                </div>
                  </motion.div>
                )}

                {customerModalTab === 'follow_up' && !isCreating && customerId && (
                  <motion.div
                    key="customer-tab-follow-up"
                    role="tabpanel"
                    aria-label="Follow-up"
                    className="min-h-[200px] space-y-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <p className="text-xs text-slate-600">
                      Log setiap sentuhan (panggilan / WhatsApp). Topik yang sama ada <strong>cooldown</strong> supaya
                      pelanggan tidak rasa spam. Maksimum{' '}
                      <strong>{followUpLimits?.maxTouchesPerWeek ?? DEFAULT_MAX_TOUCHES_PER_WEEK}</strong> sentuhan
                      dikira dalam quota (7 hari).
                    </p>
                    {followUpLimits && (
                      <p className="text-xs font-medium text-slate-800">
                        Sentuhan minggu ini (ikut quota):{' '}
                        <strong>
                          {followUpLimits.touchesLast7Days} / {followUpLimits.maxTouchesPerWeek}
                        </strong>
                      </p>
                    )}
                    {followUpError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                        {followUpError}
                      </div>
                    )}

                    <div className="rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">Sejarah</p>
                        <button
                          type="button"
                          onClick={() => customerId && void fetchFollowUpActivities(customerId)}
                          disabled={followUpLoading}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {followUpLoading ? 'Memuatkan…' : 'Muat semula'}
                        </button>
                      </div>
                      <div
                        className="max-h-[min(42vh,320px)] min-h-[72px] overflow-y-auto overscroll-contain rounded-lg border border-slate-100 bg-slate-50/80 p-2"
                        role="region"
                        aria-label="Sejarah follow-up"
                      >
                        {followUpLoading ? (
                          <p className="px-1 py-2 text-xs text-slate-500">Memuatkan log…</p>
                        ) : followUpActivities.length === 0 ? (
                          <p className="px-1 py-2 text-xs text-slate-500">
                            Tiada log lagi. Tambah sentuhan pertama di bawah.
                          </p>
                        ) : (
                          <ul className="space-y-2 pr-1">
                            {followUpActivities.map((a) => (
                              <li
                                key={a.id}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 shadow-sm"
                              >
                                <div className="flex flex-wrap items-baseline justify-between gap-1">
                                  <span className="font-semibold text-slate-900">{getTopicLabel(a.topic)}</span>
                                  <span className="text-[10px] text-slate-500">
                                    {new Date(a.occurred_at).toLocaleString('ms-MY', { timeZone: 'Asia/Kuala_Lumpur' })}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[11px] text-slate-600">
                                  {getChannelLabel(a.channel as FollowUpChannel)}
                                  {a.outcome ? ` · ${a.outcome}` : ''}
                                  {!a.counts_toward_quota ? ' · tidak kira quota' : ''}
                                </p>
                                {a.notes ? (
                                  <p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-700">{a.notes}</p>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                      <p className="text-sm font-semibold text-slate-800">Tambah log</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Topik</label>
                          <select
                            value={followUpTopic}
                            onChange={(e) => setFollowUpTopic(e.target.value)}
                            disabled={followUpSubmitting}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          >
                            {FOLLOW_UP_TOPICS.map((t) => (
                              <option key={t.key} value={t.key}>
                                {t.labelMs}
                              </option>
                            ))}
                          </select>
                          {followUpTopicHint && (
                            <p className="mt-1 text-[11px] leading-snug text-amber-800">{followUpTopicHint}</p>
                          )}
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Saluran</label>
                          <select
                            value={followUpChannel}
                            onChange={(e) => setFollowUpChannel(e.target.value as FollowUpChannel)}
                            disabled={followUpSubmitting}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          >
                            {FOLLOW_UP_CHANNELS.map((c) => (
                              <option key={c} value={c}>
                                {getChannelLabel(c)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">Outcome (pilihan)</label>
                          <select
                            value={followUpOutcome}
                            onChange={(e) => setFollowUpOutcome(e.target.value)}
                            disabled={followUpSubmitting}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          >
                            <option value="">—</option>
                            {FOLLOW_UP_OUTCOMES.map((o) => (
                              <option key={o} value={o}>
                                {o}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-slate-600">
                            Tarikh / masa (lalai: sekarang — kosongkan untuk masa simpan)
                          </label>
                          <input
                            type="datetime-local"
                            value={followUpOccurredAt}
                            onChange={(e) => setFollowUpOccurredAt(e.target.value)}
                            disabled={followUpSubmitting}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                          />
                        </div>
                      </div>
                      <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={followUpCountsQuota}
                          onChange={(e) => setFollowUpCountsQuota(e.target.checked)}
                          disabled={followUpSubmitting}
                          className="h-4 w-4 rounded border-slate-400 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
                        />
                        Kira dalam quota mingguan (nyahaktifkan untuk log dalaman / ujian)
                      </label>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-600">Nota</label>
                        <textarea
                          value={followUpNotes}
                          onChange={(e) => setFollowUpNotes(e.target.value)}
                          rows={3}
                          disabled={followUpSubmitting}
                          placeholder="Ringkasan sembang, janji seterusnya, dll."
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleSubmitFollowUp()}
                        disabled={followUpSubmitting}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {followUpSubmitting ? (
                          <>
                            <svg
                              className="h-4 w-4 shrink-0 animate-spin"
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
                            Menyimpan…
                          </>
                        ) : (
                          'Simpan log'
                        )}
                      </button>
                    </div>
                  </motion.div>
                )}

                {customerModalTab === 'tags' && (
                  <motion.div
                    key="customer-tab-tags"
                    role="tabpanel"
                    aria-label="Tags"
                    className="min-h-[200px] space-y-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ type: 'tween', duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                  >
                    <div className="mb-1">
                      <div className="flex items-center justify-between gap-3">
                        <label className="block text-sm font-medium text-slate-700">WhatsApp labels</label>
                        {!isCreating && customerId && (
                          <button
                            type="button"
                            onClick={() => void fetchCustomerLabels(customerId)}
                            disabled={labelsLoading}
                            className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
                          >
                            {labelsLoading ? 'Refreshing...' : 'Refresh labels'}
                          </button>
                        )}
                      </div>
                      <div className="mt-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 min-h-[42px]">
                        {isCreating ? (
                          <span className="text-xs text-slate-500">
                            Labels are available after the customer is created.
                          </span>
                        ) : labelsLoading ? (
                          <span className="text-xs text-slate-500">Loading labels...</span>
                        ) : labelsError ? (
                          <span className="text-xs text-red-600 whitespace-pre-wrap break-words">{labelsError}</span>
                        ) : customerLabels.length === 0 ? (
                          <span className="text-xs text-slate-500">No labels found on WhatsApp.</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {customerLabels.map((label, idx) => {
                              const labelId = String(label.id ?? `${label.name || 'label'}-${idx}`)
                              const hasHex =
                                typeof label.colorHex === 'string' &&
                                /^#([A-Fa-f0-9]{3}|[A-Fa-f0-9]{6})$/.test(label.colorHex)
                              const bgColor = hasHex ? `${label.colorHex}22` : '#e2e8f0'
                              const borderColor = hasHex ? label.colorHex : '#cbd5e1'
                              return (
                                <span
                                  key={labelId}
                                  className="inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium text-slate-800"
                                  style={{ backgroundColor: bgColor, borderColor }}
                                  title={`Label ID: ${label.id ?? '-'}`}
                                >
                                  {label.name || `Label ${label.id ?? ''}`}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium text-slate-800">Chat history</p>
                          <p className="text-xs text-slate-500">Latest WhatsApp conversation with this customer.</p>
                        </div>
                        {!isCreating && customerId && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleOpenFullChatHistory()}
                              disabled={chatHistoryDialogLoading}
                              className="px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-60 transition-colors"
                            >
                              View all messages
                            </button>
                            <button
                              type="button"
                              onClick={() => void fetchCustomerChatHistory(customerId)}
                              disabled={chatHistoryLoading}
                              className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-60 transition-colors"
                            >
                              {chatHistoryLoading ? 'Refreshing...' : 'Refresh chat'}
                            </button>
                          </div>
                        )}
                      </div>

                      {isCreating ? (
                        <span className="text-xs text-slate-500">
                          Save the new customer first, then open them again to view chat history.
                        </span>
                      ) : chatHistoryLoading ? (
                        <span className="text-xs text-slate-500">Loading chat history...</span>
                      ) : chatHistoryError ? (
                        <span className="text-xs text-red-600 whitespace-pre-wrap break-words">{chatHistoryError}</span>
                      ) : chatHistory.length === 0 ? (
                        <span className="text-xs text-slate-500">No readable chat messages found.</span>
                      ) : (
                        <div className="max-h-[260px] space-y-2 overflow-y-auto pr-1">
                          {chatHistory.map((m) => (
                            <div
                              key={m.id}
                              className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}
                            >
                              <div
                                className={`max-w-[92%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                                  m.fromMe
                                    ? 'bg-blue-600 text-white rounded-br-md'
                                    : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                                }`}
                              >
                                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                {typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) && (
                                  <p
                                    className={`mt-1 text-[10px] ${
                                      m.fromMe ? 'text-blue-100' : 'text-slate-400'
                                    }`}
                                  >
                                    {new Date(m.timestamp).toLocaleString()}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {isCreating ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                        <p className="text-sm font-medium text-slate-800">CRM tags</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Save the new customer first, then open them again to assign CRM tags from the catalog.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <label className="block text-sm font-medium text-slate-700">CRM tags</label>
                            <p className="mt-0.5 text-xs text-slate-500">
                              Segmentation labels from admin catalog. Single-choice categories replace the previous pick
                              in that group.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleAnalyzeAi()}
                            disabled={
                              analyzeAiLoading ||
                              tagCatalogLoading ||
                              crmTagsLoading ||
                              !tagCatalog ||
                              tagCatalog.categories.length === 0
                            }
                            className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900 shadow-sm transition hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {analyzeAiLoading ? (
                              <span className="inline-flex items-center gap-1.5">
                                <svg
                                  className="h-3.5 w-3.5 animate-spin"
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
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                                  />
                                </svg>
                                Analyzing…
                              </span>
                            ) : (
                              'Analyze AI'
                            )}
                          </button>
                        </div>
                        {analyzeAiError && (
                          <div className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                            {analyzeAiError}
                          </div>
                        )}
                        {analyzeAiNotice && !analyzeAiError && (
                          <div className="mb-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            {analyzeAiNotice}
                          </div>
                        )}
                        <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-3">
                          {tagCatalogLoading || crmTagsLoading ? (
                            <span className="text-xs text-slate-500">Loading tags…</span>
                          ) : !tagCatalog || tagCatalog.categories.length === 0 ? (
                            <span className="text-xs text-slate-500">
                              No tag catalog yet. Ask an admin to add categories and tags in Admin → Settings.
                            </span>
                          ) : (
                            <div className="max-h-[min(55vh,420px)] space-y-4 overflow-y-auto pr-1">
                              {tagCatalog.categories.map((cat) => {
                                const tagsInCat = tagCatalog.tags.filter((t) => t.category_id === cat.id)
                                if (tagsInCat.length === 0) return null
                                return (
                                  <div key={cat.id}>
                                    <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                      {cat.name}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {tagsInCat.map((t) => {
                                        const selected = crmSelectedTagIds.includes(t.id)
                                        return (
                                          <button
                                            key={t.id}
                                            type="button"
                                            onClick={() => toggleCrmTag(t.id, cat)}
                                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                              selected
                                                ? 'bg-blue-600 text-white shadow-sm ring-1 ring-blue-700/30'
                                                : 'bg-white text-slate-800 ring-1 ring-slate-200 hover:bg-slate-100'
                                            }`}
                                          >
                                            {t.label}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                </AnimatePresence>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    disabled={isPostingCustomer || followUpSubmitting}
                    onClick={() => {
                      if (isPostingCustomer || followUpSubmitting) return
                      handleModalDismiss()
                    }}
                    className="px-4 py-2 text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isPostingCustomer || followUpSubmitting}
                    onClick={isCreating ? handleCreate : handleSaveEdit}
                    className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isPostingCustomer ? (
                      <>
                        <svg
                          className="h-4 w-4 shrink-0 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        {isCreating ? 'Creating…' : 'Saving…'}
                      </>
                    ) : (
                      <span>{isCreating ? 'Create' : 'Save'}</span>
                    )}
                  </button>
                </div>

                {chatHistoryDialogOpen && !isCreating && (
                  <div
                    className={`fixed inset-0 ${Z_CUSTOMER_MODAL_NESTED} flex items-center justify-center bg-black/60 p-4`}
                    onClick={() => setChatHistoryDialogOpen(false)}
                  >
                    <div
                      className="w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900">Full chat history</h3>
                          <p className="text-xs text-slate-500">Entire conversation between user and customer.</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {customerId && (
                            <button
                              type="button"
                              onClick={() => void fetchCustomerChatHistory(customerId, 200, true)}
                              disabled={chatHistoryDialogLoading}
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {chatHistoryDialogLoading ? 'Refreshing...' : 'Refresh'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setChatHistoryDialogOpen(false)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                            aria-label="Close full chat history"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[70vh] overflow-y-auto p-4">
                        {chatHistoryDialogLoading ? (
                          <p className="text-xs text-slate-500">Loading full chat history...</p>
                        ) : chatHistoryError ? (
                          <p className="text-xs text-red-600 whitespace-pre-wrap break-words">{chatHistoryError}</p>
                        ) : chatHistory.length === 0 ? (
                          <p className="text-xs text-slate-500">No readable chat messages found.</p>
                        ) : (
                          <div className="space-y-2">
                            {chatHistory.map((m) => (
                              <div key={`${m.id}-full`} className={`flex ${m.fromMe ? 'justify-end' : 'justify-start'}`}>
                                <div
                                  className={`max-w-[90%] rounded-2xl px-3 py-2 text-xs leading-relaxed shadow-sm ${
                                    m.fromMe
                                      ? 'bg-blue-600 text-white rounded-br-md'
                                      : 'bg-slate-50 text-slate-800 border border-slate-200 rounded-bl-md'
                                  }`}
                                >
                                  <p className="whitespace-pre-wrap break-words">{m.text}</p>
                                  {typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) && (
                                    <p className={`mt-1 text-[10px] ${m.fromMe ? 'text-blue-100' : 'text-slate-400'}`}>
                                      {new Date(m.timestamp).toLocaleString()}
                                    </p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
