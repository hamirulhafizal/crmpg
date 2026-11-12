'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { adminFetch } from '@/app/lib/admin-api-client'
import { useAuth } from '@/app/contexts/auth-context'
import { createClient } from '@/app/lib/supabase/client'
import type {
  SocialCalendarEvent,
  TryPostPublishMode,
  TryPostSocialAccount,
} from '@/app/lib/trypost/types'
import { SocialScheduleCalendar } from '@/app/(crm)/social-scheduling/_components/SocialScheduleCalendar'

type WorkspacePublic = {
  id: string
  trypost_workspace_id: string
  trypost_workspace_name: string | null
  status: string
  last_error: string | null
  channels: TryPostSocialAccount[]
  channels_synced_at: string | null
  apiKeyConfigured: boolean
}

type Entitlements = {
  access: boolean
  maxChannels: number
  analytics: boolean
  isPlatformAdmin: boolean
  planSlug: string
}

export default function SocialSchedulingPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [mounted, setMounted] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)

  const [workspace, setWorkspace] = useState<WorkspacePublic | null>(null)
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null)
  const [steps, setSteps] = useState<string[]>([])
  const [apiKeysUrl, setApiKeysUrl] = useState('https://app.trypost.it/settings/workspace/api-keys')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)

  const [apiKeyInput, setApiKeyInput] = useState('')
  const [calendarEvents, setCalendarEvents] = useState<SocialCalendarEvent[]>([])
  const [calendarLoading, setCalendarLoading] = useState(false)
  const [calendarTimeZone, setCalendarTimeZone] = useState('UTC')

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    if (!authLoading && !user) router.push('/login?next=/social-scheduling')
  }, [mounted, authLoading, user, router])

  useEffect(() => {
    if (!mounted) return
    if (!user) {
      setIsAdmin(false)
      setCheckingAdmin(false)
      return
    }
    let cancelled = false
    setCheckingAdmin(true)
    ;(async () => {
      const { data, error: roleError } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()
      if (cancelled) return
      const admin = !roleError && data?.role === 'admin'
      setIsAdmin(admin)
      setCheckingAdmin(false)
      if (!admin) router.replace('/dashboard')
    })()
    return () => {
      cancelled = true
    }
  }, [mounted, user, supabase, router])

  const loadWorkspace = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await adminFetch('/api/social-scheduling/workspace')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load workspace')
      const nextWorkspace = json.workspace
        ? {
            ...json.workspace,
            channels: Array.isArray(json.workspace.channels) ? json.workspace.channels : [],
          }
        : null
      setWorkspace(nextWorkspace)
      setEntitlements(json.entitlements)
      setSteps(Array.isArray(json.assistedSetup?.steps) ? json.assistedSetup.steps : [])
      if (json.assistedSetup?.apiKeysUrl) setApiKeysUrl(json.assistedSetup.apiKeysUrl)
      if (!nextWorkspace) setSetupOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCalendar = useCallback(async () => {
    setCalendarLoading(true)
    try {
      const res = await adminFetch('/api/social-scheduling/calendar')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load calendar')
      setCalendarEvents(json.events ?? [])
      if (json.timeZone) setCalendarTimeZone(json.timeZone)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
      setCalendarEvents([])
    } finally {
      setCalendarLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isAdmin) return
    void loadWorkspace()
  }, [isAdmin, loadWorkspace])

  useEffect(() => {
    if (!isAdmin || !workspace?.id) {
      setCalendarEvents([])
      return
    }
    void loadCalendar()
  }, [isAdmin, workspace?.id, loadCalendar])

  const connectWithKey = async (usePlatformKey: boolean) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await adminFetch('/api/social-scheduling/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          usePlatformKey ? { usePlatformKey: true } : { apiKey: apiKeyInput.trim() }
        ),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Connect failed')
      setWorkspace(
        json.workspace
          ? {
              ...json.workspace,
              channels: Array.isArray(json.workspace.channels) ? json.workspace.channels : [],
            }
          : null
      )
      setEntitlements(json.entitlements)
      setApiKeyInput('')
      setSetupOpen(false)
      setMessage(
        usePlatformKey
          ? 'Connected using server TRYPOST_API_KEY.'
          : 'Workspace connected. Channels synced.'
      )
      await loadCalendar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connect failed')
    } finally {
      setSaving(false)
    }
  }

  const syncChannels = async () => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await adminFetch('/api/social-scheduling/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Sync failed')
      setWorkspace(
        json.workspace
          ? {
              ...json.workspace,
              channels: Array.isArray(json.workspace.channels) ? json.workspace.channels : [],
            }
          : null
      )
      setMessage('Channels refreshed from TryPost.')
      await loadCalendar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setSaving(false)
    }
  }

  const disconnect = async () => {
    if (!confirm('Disconnect this TryPost workspace from CRMpg?')) return
    setSaving(true)
    setError(null)
    try {
      const res = await adminFetch('/api/social-scheduling/workspace', { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Disconnect failed')
      setWorkspace(null)
      setCalendarEvents([])
      setSetupOpen(true)
      setMessage('Workspace disconnected.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Disconnect failed')
    } finally {
      setSaving(false)
    }
  }

  const createPost = async (input: {
    content: string
    socialAccountIds: string[]
    publishMode: TryPostPublishMode
    scheduledAt: string | null
    mediaUrls: string[]
    createAnother: boolean
    destinations: Array<{
      socialAccountId: string
      content?: string | null
      contentType?: string | null
      mediaUrls?: string[]
      meta?: Record<string, unknown>
    }>
  }) => {
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const res = await adminFetch('/api/social-scheduling/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: input.content,
          socialAccountIds: input.socialAccountIds,
          publishMode: input.publishMode,
          scheduledAt: input.scheduledAt,
          mediaUrls: input.mediaUrls,
          destinations: input.destinations,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to create post')
      setMessage(`Created ${json.mirrored ?? json.posts?.length ?? 0} post(s).`)
      await loadCalendar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create post')
      throw err
    } finally {
      setSaving(false)
    }
  }

  // Keep first paint identical on server + client to avoid hydration mismatches.
  if (!mounted || authLoading || checkingAdmin || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-sm text-muted-foreground">
        Checking access…
      </div>
    )
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-2 overflow-hidden px-3 py-3 sm:px-6">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7c5cff]">TryPost</p>
          <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
            Social Posts
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setSetupOpen((v) => !v)}
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {workspace ? 'Workspace settings' : 'Connect workspace'}
        </button>
      </header>

      {(error || message) && (
        <div
          className={`shrink-0 rounded-xl px-4 py-2.5 text-sm ${
            error
              ? 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'
              : 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
          }`}
        >
          {error || message}
        </div>
      )}

      {setupOpen && (
        <section className="max-h-[40%] shrink-0 space-y-3 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/80">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Connect TryPost workspace</h2>
              <p className="mt-1 text-sm text-slate-600">
                Assisted setup: create the workspace in TryPost, connect channels, paste the API key.
              </p>
            </div>
            {workspace && (
              <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                Connected · {workspace.trypost_workspace_name || workspace.trypost_workspace_id}
              </span>
            )}
          </div>

          {!workspace && (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
              {steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="block flex-1 text-sm">
              <span className="mb-1 block font-medium text-slate-700">Workspace API key</span>
              <input
                type="password"
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  workspace?.apiKeyConfigured ? '•••••••• (paste to replace)' : 'Paste TryPost API key'
                }
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none ring-[#7c5cff]/30 focus:bg-white focus:ring-2"
              />
            </label>
            <button
              type="button"
              disabled={saving || !apiKeyInput.trim()}
              onClick={() => void connectWithKey(false)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {workspace ? 'Update key' : 'Connect'}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void connectWithKey(true)}
              className="rounded-xl bg-[#7c5cff] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Use server key
            </button>
          </div>

          <div className="flex flex-wrap gap-2 text-sm">
            <a
              href={apiKeysUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg px-3 py-1.5 text-[#5b3fd6] ring-1 ring-[#7c5cff]/30 hover:bg-[#7c5cff]/5"
            >
              Open TryPost API keys
            </a>
            {workspace && (
              <>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void syncChannels()}
                  className="rounded-lg px-3 py-1.5 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                  Sync channels
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void disconnect()}
                  className="rounded-lg px-3 py-1.5 text-rose-700 ring-1 ring-rose-200 hover:bg-rose-50 disabled:opacity-50"
                >
                  Disconnect
                </button>
              </>
            )}
          </div>

          {entitlements && (
            <p className="text-xs text-slate-500">
              Plan: max channels{' '}
              {entitlements.maxChannels < 0 ? 'unlimited' : entitlements.maxChannels}
              {' · '}
              analytics {entitlements.analytics ? 'on' : 'off'} ({entitlements.planSlug})
            </p>
          )}
        </section>
      )}

      {loading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center rounded-2xl bg-[#0f0f12] text-sm text-white/50">
          Loading schedule…
        </div>
      ) : !workspace ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-4 text-center">
          <p className="text-base font-medium text-slate-900">Connect a TryPost workspace to open the calendar</p>
          <p className="mt-2 text-sm text-slate-600">Use Workspace settings above, or connect with the server key.</p>
          <button
            type="button"
            disabled={saving}
            onClick={() => void connectWithKey(true)}
            className="mt-5 rounded-xl bg-[#7c5cff] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Use server key
          </button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">
          <SocialScheduleCalendar
            events={calendarEvents}
            channels={Array.isArray(workspace.channels) ? workspace.channels : []}
            timeZone={calendarTimeZone}
            loading={calendarLoading}
            saving={saving}
            syncingChannels={saving}
            onRefresh={() => void loadCalendar()}
            onSyncChannels={syncChannels}
            onCreatePost={createPost}
          />
        </div>
      )}
    </div>
  )
}
