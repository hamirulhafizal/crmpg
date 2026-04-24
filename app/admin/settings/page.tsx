'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

type WahaServerRow = {
  id: string
  name: string
  api_base_url: string
  api_key: string
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
  if (normalized === 'WORKING') {
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

export default function AdminSettingsPage() {
  const [tab, setTab] = useState<'servers' | 'users'>('servers')

  const [servers, setServers] = useState<WahaServerRow[]>([])
  const [loadingServers, setLoadingServers] = useState(true)
  const [serverError, setServerError] = useState<string | null>(null)
  const [serverSaving, setServerSaving] = useState(false)

  const [serverModalOpen, setServerModalOpen] = useState(false)
  const [editingServerId, setEditingServerId] = useState<string | null>(null)
  const [serverName, setServerName] = useState('')
  const [serverApiBaseUrl, setServerApiBaseUrl] = useState('')
  const [serverApiKey, setServerApiKey] = useState('')
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
      const payload = {
        name: serverName.trim(),
        api_base_url: serverApiBaseUrl.trim(),
        api_key: serverApiKey.trim(),
        is_default: serverIsDefault,
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
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Web app settings</h1>
        <p className="mt-1 text-sm text-slate-600">Manage infrastructure and user management in one place.</p>
      </div>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setTab('servers')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'servers' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          WAHA Servers
        </button>
        <button
          type="button"
          onClick={() => setTab('users')}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
            tab === 'users' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          User Management
        </button>
      </div>

      {tab === 'servers' && (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">WAHA servers</h2>
              <p className="text-sm text-slate-600">CRUD WAHA API base URLs and keys.</p>
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
                    <th className="px-4 py-3">Base URL</th>
                    <th className="px-4 py-3">API key</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Default</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {servers.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                      <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-700">{s.api_base_url}</td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-700">{s.api_key || '—'}</td>
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
              <option value="all">All WAHA servers</option>
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

          <div className="mb-4 flex items-center gap-2 text-sm">
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

      {serverModalOpen && (
        <div className="fixed inset-0 z-50 top-[-2rem] flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && closeServerModal()}>
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-semibold text-slate-900">{editingServerId ? 'Edit WAHA server' : 'Add WAHA server'}</h3>
            <form onSubmit={(e) => void handleServerSubmit(e)} className="mt-6 space-y-4">
              <input value={serverName} onChange={(e) => setServerName(e.target.value)} required placeholder="Name" className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5" />
              <input value={serverApiBaseUrl} onChange={(e) => setServerApiBaseUrl(e.target.value)} required placeholder="API base URL" className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" />
              <div className="flex gap-2">
                <input value={serverApiKey} onChange={(e) => setServerApiKey(e.target.value)} required={!editingServerId} placeholder={editingServerId ? 'Leave blank to keep current key' : 'API key'} className="text-slate-900 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm" />
                <button type="button" onClick={() => void handleCopyServerApiKey()} disabled={!serverApiKey.trim()} className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900">{serverApiKeyCopied ? 'Copied' : 'Copy'}</button>
              </div>
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
                  <option key={s.id} value={s.id}>{s.name} ({s.api_base_url})</option>
                ))}
              </select>

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
                {editingUserId && (
                  <button
                    type="button"
                    onClick={() => void handleDeleteUser(editingUserId, userEmail || null)}
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete user
                  </button>
                )}
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
