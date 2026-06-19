'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { AdminPlatformWorkflowEditor } from '@/app/admin/settings/AdminPlatformWorkflowEditor'
import {
  PlatformDefaultWorkflowDialog,
  WorkflowPublishIcon,
} from '@/app/admin/settings/PlatformDefaultWorkflowDialog'
import { importPlatformDefaultExportFile } from '@/app/admin/settings/platform-default-import-client'
import type {
  PlatformCampaignDefault,
  PlatformCampaignDefaultListItem,
} from '@/app/lib/campaigns/platform-defaults'
import { TagAdminSidebar, type CategoryRow } from '@/app/admin/settings/tag-admin-sidebar'

type WahaServerRow = {
  id: string
  name: string
  api_base_url: string
  api_key: string
  dashboard_pass?: string | null
  provider_type?: 'waha' | 'wasender'
  status?: 'online' | 'offline'
  is_default: boolean
  created_at: string
  updated_at: string
}

type UserSessionRow = {
  id: string
  session_name: string
  last_known_waha_status?: string | null
  created_at?: string
}

type UserRow = {
  id: string
  email: string | null
  full_name: string | null
  role: 'user' | 'admin'
  locale?: string | null
  timezone?: string | null
  waha_server_id?: string | null
  sessions: UserSessionRow[]
  created_at?: string
  updated_at?: string
}

function formatSessionStatus(value: string): string {
  return value
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function normalizeStatus(value: string | null | undefined): string {
  return (value || '').trim().toUpperCase()
}

function statusBadgeClass(status: string): string {
  const normalized = normalizeStatus(status)
  if (normalized === 'WORKING' || normalized === 'CONNECTED') {
    return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
  }
  if (normalized === 'FAILED') {
    return 'bg-red-50 text-red-700 ring-red-200'
  }
  if (normalized === 'STOPPED') {
    return 'bg-slate-100 text-slate-700 ring-slate-300'
  }
  if (normalized === 'NO_SESSION') {
    return 'bg-blue-50 text-blue-700 ring-blue-200'
  }
  return 'bg-amber-50 text-amber-700 ring-amber-200'
}

type PaymentGatewayStatus = {
  provider: 'bayarcash'
  apiBase: string | null
  sandbox: boolean
  paymentChannel: string | null
  googleAdsRenewalIntegration: boolean
  credentialsConfigured: {
    personalAccessToken: boolean
    apiSecret: boolean
    portalKey: boolean
  }
  fullyConfigured: boolean
}

type AutomationTemplateSettings = {
  birthday: string
  inactive_followup: string
  free_followup: string
  active_profile_unverified_followup: string
  active_verified_no_autodebit_followup: string
}

const EMPTY_AUTOMATION_TEMPLATES: AutomationTemplateSettings = {
  birthday: '',
  inactive_followup: '',
  free_followup: '',
  active_profile_unverified_followup: '',
  active_verified_no_autodebit_followup: '',
}

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<
    'servers' | 'users' | 'tags' | 'payment' | 'automation_templates' | 'campaign_workflow_defaults'
  >('servers')

  const [servers, setServers] = useState<WahaServerRow[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverSaving, setServerSaving] = useState(false)

  const [serverModalOpen, setServerModalOpen] = useState(false)
  const [editingServerId, setEditingServerId] = useState<string | null>(null)
  const [serverName, setServerName] = useState('')
  const [serverApiBaseUrl, setServerApiBaseUrl] = useState('')
  const [serverApiKey, setServerApiKey] = useState('')
  const [serverDashboardPass, setServerDashboardPass] = useState('')
  const [serverProviderType, setServerProviderType] = useState<'waha' | 'wasender'>('waha')
  const [serverIsDefault, setServerIsDefault] = useState(false)
  const [serverApiKeyCopied, setServerApiKeyCopied] = useState(false)

  const [users, setUsers] = useState<UserRow[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [userError, setUserError] = useState<string | null>(null)
  const [userSaving, setUserSaving] = useState(false)
  const [syncingSessions, setSyncingSessions] = useState(false)
  const [syncMessage, setSyncMessage] = useState<string | null>(null)

  const [userModalOpen, setUserModalOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [userFullName, setUserFullName] = useState('')
  const [userRole, setUserRole] = useState<'user' | 'admin'>('user')
  const [userLocale, setUserLocale] = useState('en')
  const [userTimezone, setUserTimezone] = useState('')
  const [userWahaServerId, setUserWahaServerId] = useState('')
  const [newSessionName, setNewSessionName] = useState('')
  const [filterRole, setFilterRole] = useState<'all' | 'user' | 'admin'>('all')
  const [filterServerId, setFilterServerId] = useState<string>('all')
  const [filterSessionStatus, setFilterSessionStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const [tagCategories, setTagCategories] = useState<CategoryRow[]>([])
  const [tagCatalogLoading, setTagCatalogLoading] = useState(false)
  const [tagCatalogError, setTagCatalogError] = useState<string | null>(null)
  /** After first successful load while Tags tab was visited; avoids refetch on every tab switch. */
  const [tagCatalogCacheReady, setTagCatalogCacheReady] = useState(false)

  const [paymentGateway, setPaymentGateway] = useState<PaymentGatewayStatus | null>(null)
  const [paymentGatewayLoading, setPaymentGatewayLoading] = useState(false)
  const [paymentGatewayError, setPaymentGatewayError] = useState<string | null>(null)
  const [paymentGatewayCacheReady, setPaymentGatewayCacheReady] = useState(false)
  const [automationTemplates, setAutomationTemplates] = useState<AutomationTemplateSettings>(
    EMPTY_AUTOMATION_TEMPLATES
  )
  const [automationTemplateLoading, setAutomationTemplateLoading] = useState(false)
  const [automationTemplateSaving, setAutomationTemplateSaving] = useState(false)
  const [automationTemplateError, setAutomationTemplateError] = useState<string | null>(null)
  const [automationTemplateSuccess, setAutomationTemplateSuccess] = useState<string | null>(null)
  const [automationTemplateCacheReady, setAutomationTemplateCacheReady] = useState(false)

  const [campaignDefaultLoading, setCampaignDefaultLoading] = useState(false)
  const [campaignDefaultSaving, setCampaignDefaultSaving] = useState(false)
  const [campaignDefaultError, setCampaignDefaultError] = useState<string | null>(null)
  const [campaignDefaultSuccess, setCampaignDefaultSuccess] = useState<string | null>(null)
  const [campaignDefaultCacheReady, setCampaignDefaultCacheReady] = useState(false)
  const [campaignDefaultSourceId, setCampaignDefaultSourceId] = useState('825c980a-ca90-45c7-b375-3b143ade5369')
  const [campaignDefaultData, setCampaignDefaultData] = useState<PlatformCampaignDefault | null>(null)
  const [campaignDefaultName, setCampaignDefaultName] = useState('Birthday')
  const [allPlatformDefaults, setAllPlatformDefaults] = useState<PlatformCampaignDefaultListItem[]>([])
  const [syncedByDefaultId, setSyncedByDefaultId] = useState<Record<string, number>>({})
  const [jsonImportTier, setJsonImportTier] = useState<'free' | 'pro'>('pro')
  const [jsonImportBusy, setJsonImportBusy] = useState(false)
  const [jsonImportProgress, setJsonImportProgress] = useState<{
    percent: number
    label: string
  } | null>(null)
  const [jsonImportDebug, setJsonImportDebug] = useState<string | null>(null)
  const jsonImportTierRef = useRef<'free' | 'pro'>('pro')
  const [selectedDefaultIds, setSelectedDefaultIds] = useState<Set<string>>(new Set())
  const jsonImportInputRef = useRef<HTMLInputElement>(null)
  const [campaignWorkflowEditorOpen, setCampaignWorkflowEditorOpen] = useState(false)
  const [metaDrafts, setMetaDrafts] = useState<
    Record<string, { name: string; tier: 'free' | 'pro' }>
  >({})
  const [savingMetaId, setSavingMetaId] = useState<string | null>(null)
  const [publishingDefaultId, setPublishingDefaultId] = useState<string | null>(null)
  const [workflowDialogOpen, setWorkflowDialogOpen] = useState(false)
  const [workflowDialogTemplateId, setWorkflowDialogTemplateId] = useState<string | null>(null)

  const loadTagCatalog = useCallback(async () => {
    setTagCatalogLoading(true)
    setTagCatalogError(null)
    try {
      const res = await fetch('/api/admin/tag-catalog', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setTagCatalogError(typeof data.error === 'string' ? data.error : 'Failed to load tags')
        setTagCategories([])
        return
      }
      setTagCategories(Array.isArray(data.categories) ? data.categories : [])
    } catch {
      setTagCatalogError('Failed to load tags')
      setTagCategories([])
    } finally {
      setTagCatalogLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'tags' || tagCatalogCacheReady) return
    void loadTagCatalog().finally(() => setTagCatalogCacheReady(true))
  }, [tab, tagCatalogCacheReady, loadTagCatalog])

  const loadPaymentGateway = useCallback(async () => {
    setPaymentGatewayLoading(true)
    setPaymentGatewayError(null)
    try {
      const res = await fetch('/api/admin/payment-gateway', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setPaymentGatewayError(typeof data.error === 'string' ? data.error : 'Failed to load payment gateway status')
        setPaymentGateway(null)
        return
      }
      setPaymentGateway(data as PaymentGatewayStatus)
    } catch {
      setPaymentGatewayError('Failed to load payment gateway status')
      setPaymentGateway(null)
    } finally {
      setPaymentGatewayLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'payment' || paymentGatewayCacheReady) return
    void loadPaymentGateway().finally(() => setPaymentGatewayCacheReady(true))
  }, [tab, paymentGatewayCacheReady, loadPaymentGateway])

  const loadAutomationTemplates = useCallback(async () => {
    setAutomationTemplateLoading(true)
    setAutomationTemplateError(null)
    setAutomationTemplateSuccess(null)
    try {
      const res = await fetch('/api/admin/automation-templates', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAutomationTemplateError(
          typeof data.error === 'string' ? data.error : 'Failed to load automation templates'
        )
        return
      }
      const templates = data.templates && typeof data.templates === 'object' ? data.templates : {}
      setAutomationTemplates({
        birthday: typeof templates.birthday === 'string' ? templates.birthday : '',
        inactive_followup:
          typeof templates.inactive_followup === 'string' ? templates.inactive_followup : '',
        free_followup: typeof templates.free_followup === 'string' ? templates.free_followup : '',
        active_profile_unverified_followup:
          typeof templates.active_profile_unverified_followup === 'string'
            ? templates.active_profile_unverified_followup
            : '',
        active_verified_no_autodebit_followup:
          typeof templates.active_verified_no_autodebit_followup === 'string'
            ? templates.active_verified_no_autodebit_followup
            : '',
      })
    } catch {
      setAutomationTemplateError('Failed to load automation templates')
    } finally {
      setAutomationTemplateLoading(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'automation_templates' || automationTemplateCacheReady) return
    void loadAutomationTemplates().finally(() => setAutomationTemplateCacheReady(true))
  }, [tab, automationTemplateCacheReady, loadAutomationTemplates])

  const loadCampaignWorkflowDefaults = useCallback(async () => {
    setCampaignDefaultLoading(true)
    setCampaignDefaultError(null)
    try {
      const res = await fetch('/api/admin/campaign-workflow-defaults', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setCampaignDefaultError(typeof data.error === 'string' ? data.error : 'Failed to load default workflow')
        return
      }
      const def = data.data
      const allDefaults = Array.isArray(data.defaults) ? data.defaults : def ? [def] : []
      setAllPlatformDefaults(allDefaults as PlatformCampaignDefaultListItem[])
      setSyncedByDefaultId(
        data.synced_by_id && typeof data.synced_by_id === 'object'
          ? (data.synced_by_id as Record<string, number>)
          : {}
      )
      const freeDefault =
        (allDefaults as PlatformCampaignDefaultListItem[]).find((d) => d.tier === 'free') ??
        (def as PlatformCampaignDefaultListItem | null) ??
        null
      setCampaignDefaultName(typeof freeDefault?.name === 'string' ? freeDefault.name : 'Birthday')
      if (typeof freeDefault?.source_campaign_id === 'string' && freeDefault.source_campaign_id.trim()) {
        setCampaignDefaultSourceId(freeDefault.source_campaign_id)
      }
      setSelectedDefaultIds((prev) => {
        const valid = new Set(allDefaults.map((d: PlatformCampaignDefaultListItem) => d.id))
        return new Set([...prev].filter((id) => valid.has(id)))
      })
    } catch {
      setCampaignDefaultError('Failed to load default workflow')
    } finally {
      setCampaignDefaultLoading(false)
    }
  }, [])

  useEffect(() => {
    setMetaDrafts((prev) => {
      const next: Record<string, { name: string; tier: 'free' | 'pro' }> = {}
      for (const row of allPlatformDefaults) {
        next[row.id] = prev[row.id] ?? {
          name: row.name,
          tier: row.tier,
        }
      }
      return next
    })
  }, [allPlatformDefaults])

  const isMetaDraftDirty = useCallback(
    (row: PlatformCampaignDefaultListItem) => {
      const draft = metaDrafts[row.id]
      if (!draft) return false
      return draft.name.trim() !== row.name || draft.tier !== row.tier
    },
    [metaDrafts]
  )

  const saveDefaultMetadata = useCallback(
    async (row: PlatformCampaignDefaultListItem) => {
      const draft = metaDrafts[row.id]
      if (!draft) return
      const name = draft.name.trim()
      if (!name) {
        setCampaignDefaultError('Template name is required')
        return
      }

      setSavingMetaId(row.id)
      setCampaignDefaultError(null)
      setCampaignDefaultSuccess(null)
      try {
        const res = await fetch('/api/admin/campaign-workflow-defaults', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: row.id,
            name,
            tier: draft.tier,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setCampaignDefaultError(
            typeof data.error === 'string' ? data.error : 'Failed to update template'
          )
          return
        }
        const synced = Number(data.synced_campaigns ?? 0)
        setCampaignDefaultSuccess(
          `Updated "${name}".${synced > 0 ? ` Synced ${synced} user campaign(s).` : ''}`
        )
        await loadCampaignWorkflowDefaults()
      } catch {
        setCampaignDefaultError('Failed to update template')
      } finally {
        setSavingMetaId(null)
      }
    },
    [loadCampaignWorkflowDefaults, metaDrafts]
  )

  const publishDefaultWorkflow = useCallback(
    async (row: PlatformCampaignDefaultListItem) => {
      const tierLabel = row.tier === 'pro' ? 'Pro' : 'Free'
      const confirmMessage = `Publish "${row.name}" to all ${tierLabel} users?\n\nLinked campaigns will be updated and set to draft so users can review before activating.`

      if (!window.confirm(confirmMessage)) return

      setPublishingDefaultId(row.id)
      setCampaignDefaultError(null)
      setCampaignDefaultSuccess(null)
      try {
        const res = await fetch('/api/admin/campaign-workflow-defaults/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: row.id }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setCampaignDefaultError(
            typeof data.error === 'string' ? data.error : 'Failed to publish template'
          )
          return
        }

        const provisioned = Number(data.provisioned ?? 0)
        const synced = Number(data.synced ?? 0)
        const setToDraft = Number(data.set_to_draft ?? 0)
        const targetUsers = Number(data.target_users ?? 0)

        const parts = [
          `Published "${row.name}" to ${targetUsers} ${tierLabel.toLowerCase()} user(s).`,
          provisioned > 0 ? `${provisioned} new campaign(s) created.` : null,
          synced > 0 ? `${synced} linked campaign(s) updated.` : null,
          setToDraft > 0 ? `${setToDraft} campaign(s) set to draft.` : null,
        ].filter(Boolean)

        setCampaignDefaultSuccess(parts.join(' '))
        await loadCampaignWorkflowDefaults()
      } catch {
        setCampaignDefaultError('Failed to publish template')
      } finally {
        setPublishingDefaultId(null)
      }
    },
    [loadCampaignWorkflowDefaults]
  )

  const openDefaultEditor = useCallback((row: PlatformCampaignDefaultListItem) => {
    setCampaignDefaultError(null)
    setWorkflowDialogTemplateId(row.id)
    setWorkflowDialogOpen(true)
  }, [])

  useEffect(() => {
    jsonImportTierRef.current = jsonImportTier
  }, [jsonImportTier])

  useEffect(() => {
    if (tab !== 'campaign_workflow_defaults' || campaignDefaultCacheReady) return
    void loadCampaignWorkflowDefaults().finally(() => setCampaignDefaultCacheReady(true))
  }, [tab, campaignDefaultCacheReady, loadCampaignWorkflowDefaults])

  const currentUserSessions = useMemo(() => {
    if (!editingUserId) return [] as UserSessionRow[]
    return users.find((u) => u.id === editingUserId)?.sessions || []
  }, [editingUserId, users])

  const allSessionStatuses = useMemo(() => {
    const statusSet = new Set<string>()
    for (const u of users) {
      for (const s of u.sessions || []) {
        const normalized = normalizeStatus(s.last_known_waha_status)
        if (normalized) statusSet.add(normalized)
      }
    }
    return Array.from(statusSet).sort()
  }, [users])

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return users.filter((u) => {
      if (q) {
        const name = (u.full_name || '').toLowerCase()
        const email = (u.email || '').toLowerCase()
        const hasNameMatch = name.includes(q)
        const hasEmailMatch = email.includes(q)
        const hasSessionMatch = (u.sessions || []).some((s) =>
          (s.session_name || '').toLowerCase().includes(q)
        )
        if (!hasNameMatch && !hasEmailMatch && !hasSessionMatch) return false
      }

      if (filterRole !== 'all' && u.role !== filterRole) return false
      if (filterServerId !== 'all' && (u.waha_server_id || '') !== filterServerId) return false

      if (filterSessionStatus !== 'all') {
        if (filterSessionStatus === 'NO_SESSION') {
          if ((u.sessions || []).length > 0) return false
        } else {
          const hasStatus = (u.sessions || []).some(
            (s) => normalizeStatus(s.last_known_waha_status) === filterSessionStatus
          )
          if (!hasStatus) return false
        }
      }
      return true
    })
  }, [users, filterRole, filterServerId, filterSessionStatus, searchQuery])

  const isFilterActive = useMemo(() => {
    return (
      filterRole !== 'all' ||
      filterServerId !== 'all' ||
      filterSessionStatus !== 'all' ||
      searchQuery.trim().length > 0
    )
  }, [filterRole, filterServerId, filterSessionStatus, searchQuery])

  const resetUserFilters = () => {
    setFilterServerId('all')
    setFilterSessionStatus('all')
    setFilterRole('all')
    setSearchQuery('')
  }

  const loadServers = useCallback(async () => {
    setLoadingServers(true)
    setServerError(null)
    try {
      const res = await fetch('/api/admin/waha-servers', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(typeof data.error === 'string' ? data.error : 'Failed to load servers')
        setServers([])
        return
      }
      setServers(Array.isArray(data.servers) ? data.servers : [])
    } catch {
      setServerError('Failed to load servers')
      setServers([])
    } finally {
      setLoadingServers(false)
    }
  }, [])

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true)
    setUserError(null)
    try {
      const res = await fetch('/api/admin/users', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUserError(typeof data.error === 'string' ? data.error : 'Failed to load users')
        setUsers([])
        return
      }
      setUsers(Array.isArray(data.users) ? data.users : [])
    } catch {
      setUserError('Failed to load users')
      setUsers([])
    } finally {
      setLoadingUsers(false)
    }
  }, [])

  useEffect(() => {
    void loadServers()
    void loadUsers()
  }, [loadServers, loadUsers])

  const openCreateServer = () => {
    setEditingServerId(null)
    setServerName('')
    setServerApiBaseUrl('')
    setServerApiKey('')
    setServerDashboardPass('')
    setServerProviderType('waha')
    setServerIsDefault(false)
    setServerError(null)
    setServerApiKeyCopied(false)
    setServerModalOpen(true)
  }

  const openEditServer = (s: WahaServerRow) => {
    setEditingServerId(s.id)
    setServerName(s.name)
    setServerApiBaseUrl(s.api_base_url)
    setServerApiKey(s.api_key || '')
    setServerDashboardPass(s.dashboard_pass || '')
    setServerProviderType(s.provider_type === 'wasender' ? 'wasender' : 'waha')
    setServerIsDefault(s.is_default)
    setServerError(null)
    setServerApiKeyCopied(false)
    setServerModalOpen(true)
  }

  const closeServerModal = () => {
    setServerModalOpen(false)
    setEditingServerId(null)
    setServerApiKeyCopied(false)
  }

  const handleCopyServerApiKey = async () => {
    if (!serverApiKey.trim()) return
    try {
      await navigator.clipboard.writeText(serverApiKey)
      setServerApiKeyCopied(true)
      window.setTimeout(() => setServerApiKeyCopied(false), 1400)
    } catch {
      setServerError('Unable to copy API key')
    }
  }

  const handleServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setServerSaving(true)
    setServerError(null)
    try {
      const payload: Record<string, unknown> = {
        name: serverName.trim(),
        api_base_url: serverApiBaseUrl.trim() || (serverProviderType === 'wasender' ? 'https://wasenderapi.com' : ''),
        provider_type: serverProviderType,
        is_default: serverIsDefault,
        dashboard_pass: serverProviderType === 'waha' ? serverDashboardPass.trim() || null : null,
      }
      if (serverApiKey.trim()) {
        payload.api_key = serverApiKey.trim()
      }
      if (!editingServerId && !serverApiKey.trim()) {
        setServerError('API key is required for a new server')
        return
      }
      const res = await fetch(
        editingServerId ? `/api/admin/waha-servers/${editingServerId}` : '/api/admin/waha-servers',
        {
          method: editingServerId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setServerError(typeof data.error === 'string' ? data.error : 'Failed to save server')
        return
      }
      closeServerModal()
      await loadServers()
    } finally {
      setServerSaving(false)
    }
  }

  const handleServerDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete WAHA server "${label}"?`)) return
    setServerError(null)
    const res = await fetch(`/api/admin/waha-servers/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setServerError(typeof data.error === 'string' ? data.error : 'Delete failed')
      return
    }
    await loadServers()
    await loadUsers()
  }

  const openCreateUser = () => {
    setEditingUserId(null)
    setUserEmail('')
    setUserPassword('')
    setUserFullName('')
    setUserRole('user')
    setUserLocale('en')
    setUserTimezone('')
    setUserWahaServerId('')
    setNewSessionName('')
    setUserError(null)
    setUserModalOpen(true)
  }

  const openEditUser = (u: UserRow) => {
    setEditingUserId(u.id)
    setUserEmail(u.email || '')
    setUserPassword('')
    setUserFullName(u.full_name || '')
    setUserRole(u.role || 'user')
    setUserLocale(u.locale || 'en')
    setUserTimezone(u.timezone || '')
    setUserWahaServerId(u.waha_server_id || '')
    setNewSessionName('')
    setUserError(null)
    setUserModalOpen(true)
  }

  const closeUserModal = () => {
    setUserModalOpen(false)
    setEditingUserId(null)
    setNewSessionName('')
  }

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setUserSaving(true)
    setUserError(null)
    try {
      const payload: Record<string, unknown> = {
        email: userEmail.trim(),
        full_name: userFullName.trim() || null,
        role: userRole,
        locale: userLocale.trim() || 'en',
        timezone: userTimezone.trim() || null,
        waha_server_id: userWahaServerId || null,
      }
      if (userPassword.trim()) payload.password = userPassword.trim()

      const res = await fetch(editingUserId ? `/api/admin/users/${editingUserId}` : '/api/admin/users', {
        method: editingUserId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUserError(typeof data.error === 'string' ? data.error : 'Failed to save user')
        return
      }
      closeUserModal()
      await loadUsers()
    } finally {
      setUserSaving(false)
    }
  }

  const handleDeleteUser = async (id: string, email: string | null) => {
    if (!window.confirm(`Delete user ${email || id}?`)) return
    setUserError(null)
    const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setUserError(typeof data.error === 'string' ? data.error : 'Delete failed')
      return
    }
    await loadUsers()
  }

  const handleAddSessionForUser = async () => {
    if (!editingUserId || !newSessionName.trim()) return
    setUserError(null)
    const res = await fetch(`/api/admin/users/${editingUserId}/waha-sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_name: newSessionName.trim() }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setUserError(typeof data.error === 'string' ? data.error : 'Failed to add session')
      return
    }
    setNewSessionName('')
    await loadUsers()
  }

  const handleDeleteSessionForUser = async (sessionId: string) => {
    if (!editingUserId) return
    setUserError(null)
    const res = await fetch(`/api/admin/users/${editingUserId}/waha-sessions/${sessionId}`, {
      method: 'DELETE',
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setUserError(typeof data.error === 'string' ? data.error : 'Failed to delete session')
      return
    }
    await loadUsers()
  }

  const handleSyncLatestSessions = async () => {
    setSyncingSessions(true)
    setSyncMessage(null)
    setUserError(null)
    try {
      const res = await fetch('/api/admin/users/sync-sessions', { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setUserError(typeof data.error === 'string' ? data.error : 'Failed to sync sessions')
        return
      }
      const summary = data?.summary
      if (summary) {
        setSyncMessage(
          `Synced ${summary.updated ?? 0} mappings (${summary.unchanged ?? 0} unchanged).`
        )
      } else {
        setSyncMessage('Session sync completed.')
      }
      await loadUsers()
    } finally {
      setSyncingSessions(false)
    }
  }

  return (
    <div className="min-w-0 space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Web app settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage users, WAHA, tags, and payment gateway (Bayarcash) from one place.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          User Management
        </button>

        <button
          type="button"
          onClick={() => setTab('servers')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'servers' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          WhatsApp Servers
        </button>

        <button
          type="button"
          onClick={() => setTab('tags')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'tags' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          Tags
        </button>

        <button
          type="button"
          onClick={() => setTab('payment')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'payment' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          Payment gateway
        </button>
        <button
          type="button"
          onClick={() => setTab('automation_templates')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'automation_templates' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          Automation templates
        </button>
        <button
          type="button"
          onClick={() => setTab('campaign_workflow_defaults')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === 'campaign_workflow_defaults' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          Default workflow
        </button>
      </div>

      {tab === 'users' && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">User management</h2>
              <p className="text-sm text-slate-600">Create users, edit profile details, and manage WAHA sessions/server assignment.</p>
            </div>
            <button
              type="button"
              onClick={openCreateUser}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add user
            </button>
            <button
              type="button"
              onClick={() => void handleSyncLatestSessions()}
              disabled={syncingSessions}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {syncingSessions ? 'Syncing...' : 'Fetch latest sessions'}
            </button>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-5">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search name or session"
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={filterServerId}
              onChange={(e) => setFilterServerId(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All WhatsApp servers</option>
              <option value="">Default/Fallback</option>
              {servers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <select
              value={filterSessionStatus}
              onChange={(e) => setFilterSessionStatus(e.target.value)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All session statuses</option>
              <option value="NO_SESSION">No session</option>
              {allSessionStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatSessionStatus(status)}
                </option>
              ))}
            </select>

            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value as 'all' | 'user' | 'admin')}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="all">All roles</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
            <button
              type="button"
              onClick={resetUserFilters}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Clear filters
            </button>
          </div>

          {userError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{userError}</div>
          )}
          {syncMessage && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {syncMessage}
            </div>
          )}

          {loadingUsers ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <div className="mb-4 flex items-center gap-2 p-4 text-sm">
                {isFilterActive ? (
                  <>
                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                      Filter active
                    </span>
                    <span className="text-slate-700">
                      Showing <span className="font-semibold">{filteredUsers.length}</span> of{' '}
                      <span className="font-semibold">{users.length}</span> users
                    </span>
                  </>
                ) : (
                  <span className="text-slate-700">
                    Showing all users: <span className="font-semibold">{users.length}</span>
                  </span>
                )}
              </div>
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">User ID</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Full name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Server</th>
                    <th className="px-4 py-3">Session name</th>
                    <th className="px-4 py-3">Session status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((u) => (
                    <tr
                      key={u.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openEditUser(u)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openEditUser(u)
                        }
                      }}
                      className="cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{u.id}</td>
                      <td className="px-4 py-3 text-slate-900">{u.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-700">{u.full_name || '—'}</td>
                      <td className="px-4 py-3 text-slate-900">{u.role}</td>
                      <td className="px-4 py-3 text-slate-900 text-xs">{servers.find((s) => s.id === u.waha_server_id)?.name || 'Default/Fallback'}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {u.sessions && u.sessions.length > 0
                          ? Array.from(new Set(u.sessions.map((s) => (s.session_name || '').trim()).filter(Boolean)))
                            .slice(0, 3)
                            .join(', ')
                          : 'No session'}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {u.sessions && u.sessions.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {Array.from(
                              new Set(
                                u.sessions
                                  .map((s) => normalizeStatus(s.last_known_waha_status))
                                  .filter((s) => s.length > 0)
                              )
                            )
                              .slice(0, 3)
                              .map((status) => (
                                <span
                                  key={status}
                                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadgeClass(status)}`}
                                >
                                  {formatSessionStatus(status)}
                                </span>
                              ))}
                          </div>
                        ) : (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${statusBadgeClass('NO_SESSION')}`}>
                            No session
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'servers' && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">WhatsApp servers</h2>
              <p className="text-sm text-slate-600">Manage WAHA and WasenderAPI connections for dealers.</p>
            </div>    
            <button
              type="button"
              onClick={openCreateServer}
              className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Add server
            </button>
          </div>

          {serverError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{serverError}</div>
          )}

          {loadingServers ? (
            <p className="text-sm text-slate-500">Loading...</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Provider</th>
                    <th className="px-4 py-3">Base URL</th>
                    <th className="px-4 py-3">API key</th>
                    <th className="px-4 py-3">Dashboard pass</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Default</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {servers.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase ring-1 ${
                            s.provider_type === 'wasender'
                              ? 'bg-violet-50 text-violet-800 ring-violet-200'
                              : 'bg-sky-50 text-sky-800 ring-sky-200'
                          }`}
                        >
                          {s.provider_type === 'wasender' ? 'Wasender' : 'WAHA'}
                        </span>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-700">{s.api_base_url}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{s.api_key || '—'}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {s.dashboard_pass && String(s.dashboard_pass).trim() ? '••••••••' : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{s.status === 'online' ? 'Online' : 'Offline'}</td>
                      <td className="px-4 py-3 text-slate-700">{s.is_default ? 'Yes' : '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => openEditServer(s)} className="mr-2 text-blue-600 hover:text-blue-800">Edit</button>
                        <button onClick={() => void handleServerDelete(s.id, s.name)} className="text-red-600 hover:text-red-800">Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'tags' && (
        <TagAdminSidebar
          variant="panel"
          categories={tagCategories}
          catalogLoading={tagCatalogLoading}
          catalogError={tagCatalogError}
          onReload={loadTagCatalog}
        />
      )}

      {tab === 'payment' && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Payment gateway</h2>
              <p className="mt-1 text-sm text-slate-600">
                Bayarcash configuration is read from server environment variables. Secret keys are never exposed in the
                browser.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadPaymentGateway()}
              disabled={paymentGatewayLoading}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {paymentGatewayLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {paymentGatewayError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{paymentGatewayError}</div>
          )}

          {paymentGatewayLoading && !paymentGateway ? (
            <p className="text-sm text-slate-500">Loading configuration…</p>
          ) : paymentGateway ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    paymentGateway.fullyConfigured
                      ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                      : 'bg-amber-50 text-amber-900 ring-amber-200'
                  }`}
                >
                  {paymentGateway.fullyConfigured ? 'Ready to charge' : 'Incomplete configuration'}
                </span>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1 ${
                    paymentGateway.sandbox
                      ? 'bg-violet-50 text-violet-800 ring-violet-200'
                      : 'bg-slate-100 text-slate-800 ring-slate-200'
                  }`}
                >
                  {paymentGateway.sandbox ? 'Sandbox' : 'Production'}
                </span>
              </div>

              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">API base URL</dt>
                  <dd className="mt-1 break-all font-mono text-sm text-slate-900">{paymentGateway.apiBase || '—'}</dd>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Payment channel</dt>
                  <dd className="mt-1 font-mono text-sm text-slate-900">{paymentGateway.paymentChannel ?? '—'}</dd>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 sm:col-span-2">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">Google Ads renewal</dt>
                  <dd className="mt-1 text-sm text-slate-800">
                    {paymentGateway.googleAdsRenewalIntegration
                      ? 'CRM_BAYARCASH_RENEWAL enabled — renewals can use Bayarcash when checkout is wired.'
                      : 'CRM_BAYARCASH_RENEWAL is off.'}
                  </dd>
                </div>
              </dl>

              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-900">Credentials (present in env)</h3>
                <ul className="space-y-2">
                  {(
                    [
                      ['BAYARCASH_PAT', paymentGateway.credentialsConfigured.personalAccessToken, 'Personal access token'],
                      ['BAYARCASH_SECRET', paymentGateway.credentialsConfigured.apiSecret, 'API secret'],
                      ['BAYARCASH_PORTAL_KEY', paymentGateway.credentialsConfigured.portalKey, 'Portal key'],
                    ] as const
                  ).map(([envKey, ok, label]) => (
                    <li
                      key={envKey}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 ring-1 ring-slate-900/5"
                    >
                      <div>
                        <span className="font-mono text-xs text-slate-500">{envKey}</span>
                        <span className="ml-2 text-sm text-slate-800">{label}</span>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          ok ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ok ? 'Set' : 'Missing'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
                Update values in <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">.env</code> or your
                host&apos;s environment, then redeploy or restart the dev server. Never commit live tokens to git; rotate
                them if they were exposed.
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">No data.</p>
          )}
        </section>
      )}

      {tab === 'automation_templates' && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Automation default templates</h2>
              <p className="mt-1 text-sm text-slate-600">
                Manage default message templates shown in Scheduled WhatsApp Messages.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadAutomationTemplates()}
              disabled={automationTemplateLoading || automationTemplateSaving}
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              {automationTemplateLoading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>

          {automationTemplateError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {automationTemplateError}
            </div>
          )}
          {automationTemplateSuccess && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {automationTemplateSuccess}
            </div>
          )}

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              void (async () => {
                setAutomationTemplateSaving(true)
                setAutomationTemplateError(null)
                setAutomationTemplateSuccess(null)
                try {
                  const res = await fetch('/api/admin/automation-templates', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ templates: automationTemplates }),
                  })
                  const data = await res.json().catch(() => ({}))
                  if (!res.ok) {
                    setAutomationTemplateError(
                      typeof data.error === 'string' ? data.error : 'Failed to save templates'
                    )
                    return
                  }
                  setAutomationTemplateSuccess('Templates saved successfully.')
                } catch {
                  setAutomationTemplateError('Failed to save templates')
                } finally {
                  setAutomationTemplateSaving(false)
                }
              })()
            }}
          >
            {(
              [
                ['birthday', 'Birthday'],
                ['inactive_followup', 'Inactive follow-up'],
                ['free_followup', 'Free account follow-up'],
                ['active_profile_unverified_followup', 'Active profile-unverified follow-up'],
                ['active_verified_no_autodebit_followup', 'Active verified no-autodebit follow-up'],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="mb-1 block text-sm font-medium text-slate-700">{label}</label>
                <textarea
                  value={automationTemplates[key]}
                  onChange={(e) =>
                    setAutomationTemplates((prev) => ({
                      ...prev,
                      [key]: e.target.value,
                    }))
                  }
                  rows={3}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900"
                />
              </div>
            ))}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={automationTemplateSaving || automationTemplateLoading}
                className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {automationTemplateSaving ? 'Saving...' : 'Save templates'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'campaign_workflow_defaults' && (
        <section className="rounded-2xl border border-slate-200/50 bg-white p-6 shadow-xl">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-slate-900 sm:text-2xl">Default campaign workflows</h2>
              <p className="mt-1 text-sm text-slate-600">
                Free templates clone on signup. Pro templates clone when a user starts Pro trial or paid Pro.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={jsonImportTier}
                onChange={(e) => {
                  const next = e.target.value === 'free' ? 'free' : 'pro'
                  jsonImportTierRef.current = next
                  setJsonImportTier(next)
                }}
                disabled={jsonImportBusy || campaignDefaultLoading}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 disabled:opacity-60"
                aria-label="Import tier"
              >
                <option value="pro">Import as Pro</option>
                <option value="free">Import as Free</option>
              </select>
              <button
                type="button"
                disabled={jsonImportBusy || campaignDefaultLoading || campaignDefaultSaving || selectedDefaultIds.size === 0}
                onClick={() => {
                  void (async () => {
                    if (selectedDefaultIds.size === 0) return
                    if (!window.confirm(`Remove ${selectedDefaultIds.size} template(s)?`)) return
                    setCampaignDefaultSaving(true)
                    setCampaignDefaultError(null)
                    setCampaignDefaultSuccess(null)
                    try {
                      let removed = 0
                      for (const id of selectedDefaultIds) {
                        const res = await fetch(
                          `/api/admin/campaign-workflow-defaults?id=${encodeURIComponent(id)}`,
                          { method: 'DELETE' }
                        )
                        if (res.ok) removed++
                      }
                      setSelectedDefaultIds(new Set())
                      setCampaignDefaultSuccess(`Removed ${removed} template(s).`)
                      await loadCampaignWorkflowDefaults()
                    } catch {
                      setCampaignDefaultError('Failed to remove templates')
                    } finally {
                      setCampaignDefaultSaving(false)
                    }
                  })()
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800 transition hover:bg-red-100 disabled:opacity-60"
              >
                Delete selected ({selectedDefaultIds.size})
              </button>
              <button
                type="button"
                disabled={jsonImportBusy || campaignDefaultLoading || campaignDefaultSaving}
                onClick={() => void loadCampaignWorkflowDefaults()}
                title="Refresh list"
                aria-label="Refresh template list"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                {campaignDefaultLoading ? 'Refreshing…' : 'Refresh'}
              </button>
              <input
                ref={jsonImportInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                className="sr-only"
                onChange={(e) => {
                  const input = e.target
                  const picked = input.files ? Array.from(input.files) : []
                  console.log('[Import] file input change', picked.length)
                  if (picked.length === 0) {
                    console.warn('[Import] no files selected')
                    return
                  }

                  void (async () => {
                    console.group('[Import] handler start')
                    setJsonImportBusy(true)
                    setJsonImportProgress({ percent: 0, label: 'Preparing import…' })
                    setJsonImportDebug(null)
                    setCampaignDefaultError(null)
                    setCampaignDefaultSuccess(null)
                    try {
                      const tier = jsonImportTierRef.current
                      console.log('[Import] tier', tier, 'files', picked.length)
                      let totalImported = 0
                      let totalFailed = 0
                      let totalSynced = 0
                      const warnings: string[] = []
                      const debugLogs: string[] = []

                      for (let fileIndex = 0; fileIndex < picked.length; fileIndex += 1) {
                        const file = picked[fileIndex]
                        console.log('[Import] processing file', fileIndex + 1, file.name, file.size)
                        const result = await importPlatformDefaultExportFile(file, tier, (update) => {
                          const overallPct =
                            picked.length > 1
                              ? Math.round(
                                  (fileIndex / picked.length) * 100 +
                                    update.percent / picked.length
                                )
                              : update.percent
                          setJsonImportProgress({
                            percent: overallPct,
                            label: update.label,
                          })
                        })
                        totalImported += result.imported
                        totalFailed += result.failed
                        totalSynced += result.synced_campaigns
                        warnings.push(...result.warnings)
                        debugLogs.push(...result.logs)
                      }

                      console.log('[Import] done', { totalImported, totalFailed, totalSynced, warnings })
                      setJsonImportDebug(debugLogs.join('\n'))
                      if (totalImported < 1) {
                        throw new Error(warnings[0] ?? 'No templates were imported')
                      }
                      setCampaignDefaultSuccess(
                        `Imported ${totalImported} template${totalImported === 1 ? '' : 's'}` +
                          (totalFailed > 0 ? ` (${totalFailed} failed)` : '') +
                          (totalSynced > 0 ? `. Synced ${totalSynced} user campaign(s).` : '.') +
                          (warnings.length > 0
                            ? ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'}.`
                            : '')
                      )
                      await loadCampaignWorkflowDefaults()
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : 'Import failed'
                      console.error('[Import] handler failed', err)
                      setJsonImportDebug(
                        (prev) => `${prev ? `${prev}\n\n` : ''}ERROR: ${msg}`
                      )
                      setCampaignDefaultError(msg)
                    } finally {
                      input.value = ''
                      console.groupEnd()
                      setJsonImportBusy(false)
                      setTimeout(() => setJsonImportProgress(null), 1500)
                    }
                  })()
                }}
              />
              <button
                type="button"
                disabled={jsonImportBusy || campaignDefaultLoading || campaignDefaultSaving}
                onClick={() => jsonImportInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {jsonImportBusy ? 'Importing…' : 'Import JSON'}
              </button>
            </div>
          </div>

          {campaignDefaultError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {campaignDefaultError}
            </div>
          )}
          {campaignDefaultSuccess && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {campaignDefaultSuccess}
            </div>
          )}
          {jsonImportProgress && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3 text-sm text-blue-900">
                <span className="font-medium">{jsonImportProgress.label}</span>
                <span className="tabular-nums">{jsonImportProgress.percent}%</span>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-blue-100"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={jsonImportProgress.percent}
                aria-label="Import progress"
              >
                <div
                  className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
                  style={{ width: `${jsonImportProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {jsonImportDebug && (
            <details open className="mb-4 rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-xs text-slate-700">
              <summary className="cursor-pointer font-medium text-amber-950">
                Import debug log — also check DevTools Console (filter: [Import])
              </summary>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-white p-3 font-mono text-[11px] text-slate-800">
                {jsonImportDebug}
              </pre>
            </details>
          )}

          {campaignDefaultLoading ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-500">
              Loading templates…
            </div>
          ) : (
            <div className="overflow-x-auto overscroll-x-contain rounded-2xl border border-slate-200 bg-white shadow-sm">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={
                          allPlatformDefaults.length > 0 &&
                          selectedDefaultIds.size === allPlatformDefaults.length
                        }
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedDefaultIds(new Set(allPlatformDefaults.map((d) => d.id)))
                          } else {
                            setSelectedDefaultIds(new Set())
                          }
                        }}
                        aria-label="Select all templates"
                      />
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Tier</th>
                    <th className="px-4 py-3">Trigger</th>
                    <th className="px-4 py-3 text-right">Steps</th>
                    <th className="px-4 py-3 text-right">Synced</th>
                    <th className="px-4 py-3">Updated</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {allPlatformDefaults.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-10 text-center text-slate-500">
                        No templates yet. Import a workflow JSON export to get started.
                      </td>
                    </tr>
                  ) : (
                    allPlatformDefaults.map((row) => (
                        <tr key={row.id} className="hover:bg-slate-50/80">
                          <td className="px-3 py-3 align-top">
                            <input
                              type="checkbox"
                              checked={selectedDefaultIds.has(row.id)}
                              onChange={(e) =>
                                setSelectedDefaultIds((prev) => {
                                  const next = new Set(prev)
                                  if (e.target.checked) next.add(row.id)
                                  else next.delete(row.id)
                                  return next
                                })
                              }
                              aria-label={`Select template ${row.name}`}
                            />
                          </td>
                          <td className="px-4 py-3 align-top">
                            <input
                              type="text"
                              value={metaDrafts[row.id]?.name ?? row.name}
                              onChange={(e) =>
                                setMetaDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    name: e.target.value,
                                    tier: prev[row.id]?.tier ?? row.tier,
                                  },
                                }))
                              }
                              className="w-full min-w-[10rem] rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-900"
                              aria-label={`Template name for ${row.name}`}
                            />
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600">
                            {row.description?.trim() ? (
                              <p className="max-w-[16rem] text-sm leading-snug text-slate-600 line-clamp-3">
                                {row.description}
                              </p>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <select
                              value={metaDrafts[row.id]?.tier ?? row.tier}
                              onChange={(e) =>
                                setMetaDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    name: prev[row.id]?.name ?? row.name,
                                    tier: e.target.value === 'pro' ? 'pro' : 'free',
                                  },
                                }))
                              }
                              className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs font-semibold uppercase text-slate-800"
                              aria-label={`Template tier for ${row.name}`}
                            >
                              <option value="free">Free</option>
                              <option value="pro">Pro</option>
                            </select>
                          </td>
                          <td className="px-4 py-3 align-top text-slate-600">
                            <span className="capitalize">{row.trigger_type || 'manual'}</span>
                            {row.timezone ? (
                              <p className="mt-0.5 text-xs text-slate-400">{row.timezone}</p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {row.step_count ?? row.compiled_steps.length}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {syncedByDefaultId[row.id] ?? 0}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {row.updated_at ? new Date(row.updated_at).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {isMetaDraftDirty(row) ? (
                                <button
                                  type="button"
                                  disabled={savingMetaId === row.id || campaignDefaultSaving}
                                  onClick={() => void saveDefaultMetadata(row)}
                                  title="Save name and tier"
                                  aria-label="Save name and tier"
                                  className="inline-flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                                >
                                  {savingMetaId === row.id ? 'Saving…' : 'Save'}
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={
                                  publishingDefaultId === row.id ||
                                  campaignDefaultSaving ||
                                  isMetaDraftDirty(row)
                                }
                                onClick={() => void publishDefaultWorkflow(row)}
                                title={
                                  isMetaDraftDirty(row)
                                    ? 'Save changes before publishing'
                                    : 'Publish to all users on this tier'
                                }
                                aria-label="Publish to users"
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-semibold text-indigo-800 hover:bg-indigo-100 disabled:opacity-50"
                              >
                                <WorkflowPublishIcon className="h-3.5 w-3.5" />
                                {publishingDefaultId === row.id ? 'Publishing…' : 'Publish'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openDefaultEditor(row)}
                                title="Edit workflow details"
                                aria-label="Edit workflow details"
                                className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-900 hover:bg-slate-50"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                                  />
                                </svg>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  void (async () => {
                                    if (!window.confirm(`Remove template "${row.name}"?`)) return
                                    setCampaignDefaultSaving(true)
                                    setCampaignDefaultError(null)
                                    try {
                                      const res = await fetch(
                                        `/api/admin/campaign-workflow-defaults?id=${encodeURIComponent(row.id)}`,
                                        { method: 'DELETE' }
                                      )
                                      const data = await res.json().catch(() => ({}))
                                      if (!res.ok) {
                                        setCampaignDefaultError(
                                          typeof data.error === 'string' ? data.error : 'Failed to delete'
                                        )
                                        return
                                      }
                                      setSelectedDefaultIds((prev) => {
                                        const next = new Set(prev)
                                        next.delete(row.id)
                                        return next
                                      })
                                      setCampaignDefaultSuccess(`Removed "${row.name}".`)
                                      await loadCampaignWorkflowDefaults()
                                    } finally {
                                      setCampaignDefaultSaving(false)
                                    }
                                  })()
                                }}
                                title="Remove template"
                                aria-label="Remove template"
                                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-red-50 p-2 text-red-700 hover:bg-red-100"
                              >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
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
          )}

          <details className="mt-6 rounded-xl border border-slate-200 bg-slate-50/50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-700">
              Advanced: import from campaign ID
            </summary>
            <form
              className="space-y-4 border-t border-slate-200 bg-white px-4 py-4"
              onSubmit={(e) => {
                e.preventDefault()
                void (async () => {
                  setCampaignDefaultSaving(true)
                  setCampaignDefaultError(null)
                  setCampaignDefaultSuccess(null)
                  try {
                    const res = await fetch('/api/admin/campaign-workflow-defaults', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        campaign_id: campaignDefaultSourceId.trim(),
                        tier: jsonImportTier,
                      }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok) {
                      setCampaignDefaultError(
                        typeof data.error === 'string' ? data.error : 'Failed to save default workflow'
                      )
                      return
                    }
                    const synced = Number(data.synced_campaigns ?? 0)
                    setCampaignDefaultSuccess(
                      `Template saved from campaign.${synced > 0 ? ` Synced ${synced} user campaign(s).` : ''}`
                    )
                    await loadCampaignWorkflowDefaults()
                  } catch {
                    setCampaignDefaultError('Failed to save default workflow')
                  } finally {
                    setCampaignDefaultSaving(false)
                  }
                })()
              }}
            >
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Source campaign ID</label>
                <input
                  type="text"
                  value={campaignDefaultSourceId}
                  onChange={(e) => setCampaignDefaultSourceId(e.target.value)}
                  placeholder="825c980a-ca90-45c7-b375-3b143ade5369"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm text-slate-900"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Uses the selected import tier above. Copies workflow graph, steps, and bundled image backgrounds.
                </p>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={campaignDefaultSaving || campaignDefaultLoading || !campaignDefaultSourceId.trim()}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {campaignDefaultSaving ? 'Saving…' : 'Import from campaign'}
                </button>
              </div>
            </form>
          </details>
        </section>
      )}

      <PlatformDefaultWorkflowDialog
        open={workflowDialogOpen}
        templateId={workflowDialogTemplateId}
        onClose={() => {
          setWorkflowDialogOpen(false)
          setWorkflowDialogTemplateId(null)
        }}
        onSaved={() => {
          setCampaignDefaultSuccess('Template details saved.')
          void loadCampaignWorkflowDefaults()
        }}
        onOpenWorkflowCanvas={(defaults) => {
          setCampaignDefaultData(defaults)
          setCampaignDefaultName(defaults.name)
          setCampaignWorkflowEditorOpen(true)
        }}
      />

      <AdminPlatformWorkflowEditor
        open={campaignWorkflowEditorOpen}
        onClose={() => setCampaignWorkflowEditorOpen(false)}
        defaults={
          campaignDefaultData
            ? { ...campaignDefaultData, name: campaignDefaultName.trim() || campaignDefaultData.name }
            : null
        }
        onSaved={() => {
          setCampaignWorkflowEditorOpen(false)
          setCampaignDefaultSuccess('Platform default workflow saved.')
          void loadCampaignWorkflowDefaults()
        }}
        pushToast={(type, text) => {
          if (type === 'success') setCampaignDefaultSuccess(text)
          else setCampaignDefaultError(text)
        }}
      />

      {serverModalOpen && (
        <div className="fixed inset-0 z-50 top-[-2rem] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && closeServerModal()}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{editingServerId ? 'Edit WhatsApp server' : 'Add WhatsApp server'}</h3>
            <form onSubmit={(e) => void handleServerSubmit(e)} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Provider</label>
                <select
                  value={serverProviderType}
                  onChange={(e) => {
                    const next = e.target.value === 'wasender' ? 'wasender' : 'waha'
                    setServerProviderType(next)
                    if (next === 'wasender' && !serverApiBaseUrl.trim()) {
                      setServerApiBaseUrl('https://wasenderapi.com')
                    }
                  }}
                  className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
                >
                  <option value="waha">WAHA (self-hosted)</option>
                  <option value="wasender">WasenderAPI (cloud)</option>
                </select>
              </div>
              <input value={serverName} onChange={(e) => setServerName(e.target.value)} required placeholder="Name" className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              <input value={serverApiBaseUrl} onChange={(e) => setServerApiBaseUrl(e.target.value)} required placeholder={serverProviderType === 'wasender' ? 'https://wasenderapi.com' : 'API base URL'} className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" />
              <div className="flex gap-2">
                <input value={serverApiKey} onChange={(e) => setServerApiKey(e.target.value)} required={!editingServerId} placeholder={editingServerId ? 'Leave blank to keep current key' : serverProviderType === 'wasender' ? 'Wasender personal access token' : 'API key'} className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" />
                <button type="button" onClick={() => void handleCopyServerApiKey()} disabled={!serverApiKey.trim()} className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900">{serverApiKeyCopied ? 'Copied' : 'Copy'}</button>
              </div>
              {serverProviderType === 'waha' ? (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">WAHA dashboard password (optional)</label>
                <input
                  type="text"
                  value={serverDashboardPass}
                  onChange={(e) => setServerDashboardPass(e.target.value)}
                  autoComplete="new-password"
                  placeholder={editingServerId ? 'Leave blank to clear' : 'Optional'}
                  className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Stored on this server row for your reference (e.g. WAHA web UI). Clear the field and save to remove.
                </p>
              </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Wasender uses one platform token for all dealers. Each dealer gets their own session after scanning QR.
                </p>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={serverIsDefault} onChange={(e) => setServerIsDefault(e.target.checked)} />
                <span className="text-sm text-slate-700">Set as default</span>
              </label>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={closeServerModal} className="rounded-xl px-4 py-2.5 text-sm">Cancel</button>
                <button type="submit" disabled={serverSaving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">{serverSaving ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {userModalOpen && (
        <div className="fixed inset-0 z-50 top-[-2rem] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && closeUserModal()}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{editingUserId ? 'Edit user' : 'Create user'}</h3>
            <form onSubmit={(e) => void handleUserSubmit(e)} className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} required placeholder="Email" className="text-slate-900 rounded-xl border border-slate-300 px-3 py-2.5" />
              <input value={userPassword} onChange={(e) => setUserPassword(e.target.value)} required={!editingUserId} placeholder={editingUserId ? 'New password (optional)' : 'Password'} className="rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900" />
              <input value={userFullName} onChange={(e) => setUserFullName(e.target.value)} placeholder="Full name" className="rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900" />
              <select value={userRole} onChange={(e) => setUserRole(e.target.value as 'user' | 'admin')} className="rounded-xl border border-slate-300 text-slate-900 px-3 py-2.5 ">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <input value={userLocale} onChange={(e) => setUserLocale(e.target.value)} placeholder="Locale" className="rounded-xl border border-slate-300 text-slate-900 px-3 py-2.5" />
              <input value={userTimezone} onChange={(e) => setUserTimezone(e.target.value)} placeholder="Timezone" className="rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900" />
              <select value={userWahaServerId} onChange={(e) => setUserWahaServerId(e.target.value)} className="rounded-xl border border-slate-300 px-3 py-2.5 md:col-span-2 text-slate-900">
                <option value="">Use default/fallback</option>
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.provider_type === 'wasender' ? 'Wasender' : 'WAHA'})
                  </option>
                ))}
              </select>
              <p className="md:col-span-2 text-xs text-amber-700">
                Changing the assigned server clears the dealer&apos;s WhatsApp session — they must scan QR again.
              </p>

              {editingUserId && (
                <div className="mt-2 rounded-xl border border-slate-200 p-3 md:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-slate-900">WAHA sessions</p>
                  <div className="mb-2 flex gap-2">
                    <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Session name (e.g. 60123456789)" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900" />
                    <button type="button" onClick={() => void handleAddSessionForUser()} className="rounded-xl bg-slate-900 px-3 py-2 text-sm text-white">Add</button>
                  </div>
                  <div className="space-y-1">
                    {currentUserSessions.length === 0 ? (
                      <p className="text-xs text-slate-500">No sessions</p>
                    ) : (
                      currentUserSessions.map((s) => (
                        <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-900">
                          <span>{s.session_name} {s.last_known_waha_status ? `(${s.last_known_waha_status})` : ''}</span>
                          <button type="button" onClick={() => void handleDeleteSessionForUser(s.id)} className="text-red-600">Delete</button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="mt-2 flex justify-end gap-2 md:col-span-2">
                {/* {editingUserId && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(editingUserId, userEmail || null)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete user
                  </button>
                )} */}
                <button type="button" onClick={closeUserModal} className="rounded-xl px-4 py-2.5 text-sm text-slate-900">Cancel</button>
                <button type="submit" disabled={userSaving} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">{userSaving ? 'Saving...' : 'Save user'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
