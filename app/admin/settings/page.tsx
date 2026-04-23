'use client'

import { useCallback, useEffect, useState } from 'react'

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

export default function AdminSettingsPage() {
  const [servers, setServers] = useState<WahaServerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [apiBaseUrl, setApiBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [apiKeyCopied, setApiKeyCopied] = useState(false)

  const loadServers = useCallback(async () => {
    setListError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/admin/waha-servers', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setListError(typeof data?.error === 'string' ? data.error : 'Failed to load servers')
        setServers([])
        return
      }
      setServers(Array.isArray(data.servers) ? data.servers : [])
    } catch {
      setListError('Failed to load servers')
      setServers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadServers()
  }, [loadServers])

  const openCreate = () => {
    setEditingId(null)
    setName('')
    setApiBaseUrl('')
    setApiKey('')
    setIsDefault(false)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (s: WahaServerRow) => {
    setEditingId(s.id)
    setName(s.name)
    setApiBaseUrl(s.api_base_url)
    setApiKey(typeof s.api_key === 'string' ? s.api_key : '')
    setIsDefault(s.is_default)
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditingId(null)
    setFormError(null)
    setApiKeyCopied(false)
  }

  const handleCopyApiKey = async () => {
    const key = typeof apiKey === 'string' ? apiKey : ''
    if (!key.trim()) return
    try {
      await navigator.clipboard.writeText(key)
      setApiKeyCopied(true)
      window.setTimeout(() => setApiKeyCopied(false), 1500)
    } catch {
      setFormError('Unable to copy API key')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setSaving(true)
    try {
      if (editingId) {
        const payload: Record<string, unknown> = {
          name: name.trim(),
          api_base_url: apiBaseUrl.trim(),
          is_default: isDefault,
        }
        if (apiKey.trim()) payload.api_key = apiKey.trim()

        const res = await fetch(`/api/admin/waha-servers/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFormError(typeof data?.error === 'string' ? data.error : 'Save failed')
          return
        }
      } else {
        const res = await fetch('/api/admin/waha-servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            api_base_url: apiBaseUrl.trim(),
            api_key: apiKey.trim(),
            is_default: isDefault,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setFormError(typeof data?.error === 'string' ? data.error : 'Create failed')
          return
        }
      }
      closeModal()
      await loadServers()
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete WAHA server “${label}”? Profiles referencing it may lose the FK.`)) {
      return
    }
    setListError(null)
    const res = await fetch(`/api/admin/waha-servers/${id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setListError(typeof data?.error === 'string' ? data.error : 'Delete failed')
      return
    }
    await loadServers()
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Web app settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage WAHA API endpoints used by the app. API keys are stored in Supabase and never shown in full after
          saving.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-900/5">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">WAHA servers</h2>
            <p className="text-sm text-slate-600">Base URL and API key per instance.</p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 transition hover:bg-blue-700 active:scale-[0.98]"
          >
            Add server
          </button>
        </div>

        {listError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {listError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
            Loading…
          </div>
        ) : servers.length === 0 ? (
          <p className="text-sm text-slate-600">No servers yet. Add one or seed via SQL.</p>
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
                  <tr key={s.id} className="bg-white transition-colors hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="max-w-[220px] truncate px-4 py-3 font-mono text-xs text-slate-700">
                      {s.api_base_url}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{s.api_key || '—'}</td>
                    <td className="px-4 py-3">
                      {s.status === 'online' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Online
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                          Offline
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {s.is_default ? (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-emerald-200">
                          Yes
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(s)}
                        className="mr-2 text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(s.id, s.name)}
                        className="text-sm font-medium text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <div
          className="fixed mt-0 inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:items-center"
          role="presentation"
          style={{ marginTop: '0px' }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) closeModal()
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl transition-all duration-200"
            role="dialog"
            aria-labelledby="admin-waha-modal-title"
          >
            <h3 id="admin-waha-modal-title" className="text-lg font-semibold text-slate-900">
              {editingId ? 'Edit WAHA server' : 'Add WAHA server'}
            </h3>
            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
              {formError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                  {formError}
                </div>
              )}
              <div>
                <label htmlFor="waha-name" className="block text-sm font-medium text-slate-700">
                  Name
                </label>
                <input
                  id="waha-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-slate-900 outline-none ring-blue-500/0 transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="Production"
                />
              </div>
              <div>
                <label htmlFor="waha-url" className="block text-sm font-medium text-slate-700">
                  API base URL
                </label>
                <input
                  id="waha-url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  placeholder="https://waha.example.com"
                />
              </div>
              <div>
                <label htmlFor="waha-key" className="block text-sm font-medium text-slate-700">
                  API key
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    id="waha-key"
                    type="text"
                    autoComplete="new-password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    required={!editingId}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder={editingId ? 'Leave blank to keep current key' : 'X-Api-Key value'}
                  />
                  <button
                    type="button"
                    onClick={() => void handleCopyApiKey()}
                    disabled={!String(apiKey || '').trim()}
                    className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {apiKeyCopied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                {editingId && (
                  <p className="mt-1 text-xs text-slate-500">Leave blank to keep the existing key unchanged.</p>
                )}
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isDefault}
                  onChange={(e) => setIsDefault(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-800">Use as default WAHA server for new profiles</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
