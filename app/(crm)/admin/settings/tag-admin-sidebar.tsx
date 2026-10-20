'use client'

import { useCallback, useEffect, useState } from 'react'

type TagRow = {
  id: string
  category_id: string
  slug: string
  label: string
  sort_order: number
  metadata: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export type CategoryRow = {
  id: string
  key: string
  name: string
  description: string | null
  sort_order: number
  allows_multiple: boolean
  tags: TagRow[]
}

type TagAdminSidebarProps = {
  /** `sidebar` = narrow column next to settings; `panel` = full-width tab content */
  variant?: 'sidebar' | 'panel'
  /**
   * Controlled catalog (e.g. parent caches across tab switches).
   * When set with `onReload`, internal fetch-on-mount is skipped; use Refresh / after mutations to reload.
   */
  categories?: CategoryRow[]
  catalogLoading?: boolean
  catalogError?: string | null
  onReload?: () => Promise<void>
}

export function TagAdminSidebar({
  variant = 'sidebar',
  categories: categoriesProp,
  catalogLoading: catalogLoadingProp,
  catalogError: catalogErrorProp,
  onReload,
}: TagAdminSidebarProps) {
  const isPanel = variant === 'panel'
  const isControlled =
    categoriesProp !== undefined && typeof onReload === 'function'

  const [categoriesInternal, setCategoriesInternal] = useState<CategoryRow[]>([])
  const categories = isControlled ? categoriesProp! : categoriesInternal
  const [loadingInternal, setLoadingInternal] = useState(!isControlled)
  const loading = isControlled ? Boolean(catalogLoadingProp) : loadingInternal

  const [errorInternal, setErrorInternal] = useState<string | null>(null)
  const error = isControlled ? catalogErrorProp ?? errorInternal : errorInternal
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const [saving, setSaving] = useState(false)

  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatKey, setNewCatKey] = useState('')
  const [newCatName, setNewCatName] = useState('')
  const [newCatAllowsMultiple, setNewCatAllowsMultiple] = useState(true)

  const [editCatId, setEditCatId] = useState<string | null>(null)
  const [editCatName, setEditCatName] = useState('')
  const [editCatAllowsMultiple, setEditCatAllowsMultiple] = useState(true)

  const [addTagCatId, setAddTagCatId] = useState<string | null>(null)
  const [newTagSlug, setNewTagSlug] = useState('')
  const [newTagLabel, setNewTagLabel] = useState('')

  const [editTagId, setEditTagId] = useState<string | null>(null)
  const [editTagSlug, setEditTagSlug] = useState('')
  const [editTagLabel, setEditTagLabel] = useState('')

  const load = useCallback(async () => {
    if (isControlled) {
      setErrorInternal(null)
      await onReload!()
      return
    }
    setLoadingInternal(true)
    setErrorInternal(null)
    try {
      const res = await fetch('/api/admin/tag-catalog', { cache: 'no-store' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorInternal(typeof data.error === 'string' ? data.error : 'Failed to load tags')
        setCategoriesInternal([])
        return
      }
      const list = Array.isArray(data.categories) ? data.categories : []
      setCategoriesInternal(list)
    } catch {
      setErrorInternal('Failed to load tags')
      setCategoriesInternal([])
    } finally {
      setLoadingInternal(false)
    }
  }, [isControlled, onReload])

  useEffect(() => {
    if (isControlled) return
    void load()
  }, [isControlled, load])

  useEffect(() => {
    if (!categories.length) return
    setExpanded((prev) => {
      const next = { ...prev }
      for (const c of categories) {
        if (next[c.id] === undefined) next[c.id] = true
      }
      return next
    })
  }, [categories])

  const toggleCat = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorInternal(null)
    try {
      const res = await fetch('/api/admin/tag-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: newCatKey,
          name: newCatName,
          allows_multiple: newCatAllowsMultiple,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorInternal(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      setNewCatOpen(false)
      setNewCatKey('')
      setNewCatName('')
      setNewCatAllowsMultiple(true)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCategory = async (c: CategoryRow) => {
    if (
      !window.confirm(
        `Delete category “${c.name}” and all ${c.tags.length} tag(s) inside it? This removes assignments from customers.`
      )
    ) {
      return
    }
    setErrorInternal(null)
    const res = await fetch(`/api/admin/tag-categories/${c.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErrorInternal(typeof data.error === 'string' ? data.error : 'Delete failed')
      return
    }
    await load()
  }

  const openEditCategory = (c: CategoryRow) => {
    setEditCatId(c.id)
    setEditCatName(c.name)
    setEditCatAllowsMultiple(c.allows_multiple)
  }

  const handleSaveCategoryEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editCatId) return
    setSaving(true)
    setErrorInternal(null)
    try {
      const res = await fetch(`/api/admin/tag-categories/${editCatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editCatName,
          allows_multiple: editCatAllowsMultiple,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorInternal(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      setEditCatId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleCreateTag = async (e: React.FormEvent, categoryId: string) => {
    e.preventDefault()
    setSaving(true)
    setErrorInternal(null)
    try {
      const res = await fetch('/api/admin/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: categoryId,
          slug: newTagSlug,
          label: newTagLabel,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorInternal(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      setAddTagCatId(null)
      setNewTagSlug('')
      setNewTagLabel('')
      await load()
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteTag = async (t: TagRow, label: string) => {
    if (!window.confirm(`Delete tag “${label}”? Customer assignments will be removed.`)) return
    setErrorInternal(null)
    const res = await fetch(`/api/admin/tags/${t.id}`, { method: 'DELETE' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setErrorInternal(typeof data.error === 'string' ? data.error : 'Delete failed')
      return
    }
    await load()
  }

  const openEditTag = (t: TagRow) => {
    setEditTagId(t.id)
    setEditTagSlug(t.slug)
    setEditTagLabel(t.label)
  }

  const handleSaveTagEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editTagId) return
    setSaving(true)
    setErrorInternal(null)
    try {
      const res = await fetch(`/api/admin/tags/${editTagId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: editTagSlug,
          label: editTagLabel,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorInternal(typeof data.error === 'string' ? data.error : 'Save failed')
        return
      }
      setEditTagId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 ${
        isPanel ? 'p-6' : 'p-5 lg:sticky lg:top-8'
      }`}
    >
      <div className={`mb-4 flex items-start justify-between gap-2 ${isPanel ? 'flex-wrap sm:flex-nowrap' : ''}`}>
        <div className="min-w-0">
          <h2 className={`font-semibold tracking-tight text-slate-900 ${isPanel ? 'text-lg' : 'text-base'}`}>Tags</h2>
          <p className={`leading-relaxed text-slate-600 ${isPanel ? 'mt-1 text-sm' : 'mt-0.5 text-xs'}`}>
            Global tag catalog. Agents assign these on customers; automations can use the same labels.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? '…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setNewCatOpen((v) => !v)
            setErrorInternal(null)
          }}
          className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-800"
        >
          {newCatOpen ? 'Cancel' : 'New category'}
        </button>
      </div>

      {newCatOpen && (
        <form onSubmit={(e) => void handleCreateCategory(e)} className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-800">New category</p>
          <input
            value={newCatKey}
            onChange={(e) => setNewCatKey(e.target.value)}
            placeholder="Key (e.g. lifecycle)"
            className="mb-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
            required
          />
          <input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Display name"
            className="mb-2 w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-900"
            required
          />
          <label className="mb-2 flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={newCatAllowsMultiple}
              onChange={(e) => setNewCatAllowsMultiple(e.target.checked)}
            />
            Allow multiple tags in this category
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-lg bg-blue-600 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Create category'}
          </button>
        </form>
      )}

      {loading && categories.length === 0 ? (
        <p className="text-sm text-slate-500">Loading catalog…</p>
      ) : (
        <ul
          className={`space-y-2 overflow-y-auto pr-1 ${isPanel ? 'max-h-[min(78vh,920px)]' : 'max-h-[min(70vh,720px)]'}`}
        >
          {categories.map((c) => (
            <li key={c.id} className="rounded-xl border border-slate-100 bg-slate-50/50">
              <button
                type="button"
                onClick={() => toggleCat(c.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition hover:bg-slate-100/80"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                  <span className="block truncate font-mono text-[11px] text-slate-500">{c.key}</span>
                </span>
                <span className="shrink-0 text-slate-400">
                  {expanded[c.id] ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </span>
              </button>

              {expanded[c.id] && (
                <div className="border-t border-slate-100 px-3 pb-3 pt-1">
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => openEditCategory(c)}
                      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Edit category
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCategory(c)}
                      className="rounded-lg border border-red-100 bg-red-50/80 px-2 py-1 text-[11px] font-medium text-red-700 hover:bg-red-100"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddTagCatId(addTagCatId === c.id ? null : c.id)
                        setNewTagSlug('')
                        setNewTagLabel('')
                        setErrorInternal(null)
                      }}
                      className="rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                    >
                      {addTagCatId === c.id ? 'Close' : 'Add tag'}
                    </button>
                  </div>

                  {editCatId === c.id && (
                    <form
                      onSubmit={(e) => void handleSaveCategoryEdit(e)}
                      className="mb-3 rounded-lg border border-amber-200 bg-amber-50/50 p-2"
                    >
                      <p className="mb-1.5 text-[11px] font-semibold text-amber-900">Edit category</p>
                      <input
                        value={editCatName}
                        onChange={(e) => setEditCatName(e.target.value)}
                        className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                        required
                      />
                      <label className="mb-2 flex items-center gap-2 text-[11px] text-slate-700">
                        <input
                          type="checkbox"
                          checked={editCatAllowsMultiple}
                          onChange={(e) => setEditCatAllowsMultiple(e.target.checked)}
                        />
                        Multiple tags allowed
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setEditCatId(null)}
                          className="flex-1 rounded-lg border border-slate-200 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={saving}
                          className="flex-1 rounded-lg bg-slate-900 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  )}

                  {addTagCatId === c.id && (
                    <form
                      onSubmit={(e) => void handleCreateTag(e, c.id)}
                      className="mb-3 rounded-lg border border-blue-200 bg-blue-50/40 p-2"
                    >
                      <p className="mb-1.5 text-[11px] font-semibold text-blue-900">New tag in {c.name}</p>
                      <input
                        value={newTagSlug}
                        onChange={(e) => setNewTagSlug(e.target.value)}
                        placeholder="slug (e.g. vip_customer)"
                        className="mb-1.5 w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-xs text-slate-900"
                        required
                      />
                      <input
                        value={newTagLabel}
                        onChange={(e) => setNewTagLabel(e.target.value)}
                        placeholder="Label shown in UI"
                        className="mb-2 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-900"
                        required
                      />
                      <button
                        type="submit"
                        disabled={saving}
                        className="w-full rounded-lg bg-blue-600 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {saving ? 'Saving…' : 'Create tag'}
                      </button>
                    </form>
                  )}

                  <ul className="space-y-1">
                    {c.tags.length === 0 ? (
                      <li className="py-2 text-[11px] text-slate-500">No tags yet.</li>
                    ) : (
                      c.tags.map((t) => (
                        <li
                          key={t.id}
                          className="flex items-start justify-between gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-slate-100"
                        >
                          {editTagId === t.id ? (
                            <form
                              onSubmit={(e) => void handleSaveTagEdit(e)}
                              className="flex w-full flex-col gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                value={editTagSlug}
                                onChange={(e) => setEditTagSlug(e.target.value)}
                                className="w-full rounded border border-slate-300 px-1.5 py-1 font-mono text-[11px] text-slate-900"
                              />
                              <input
                                value={editTagLabel}
                                onChange={(e) => setEditTagLabel(e.target.value)}
                                className="w-full rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-900"
                              />
                              <div className="flex gap-1">
                                <button
                                  type="button"
                                  onClick={() => setEditTagId(null)}
                                  className="flex-1 rounded border border-slate-200 py-1 text-[10px]"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  disabled={saving}
                                  className="flex-1 rounded bg-slate-900 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                                >
                                  Save
                                </button>
                              </div>
                            </form>
                          ) : (
                            <>
                              <div className="min-w-0 flex-1">
                                <span className="block truncate text-xs font-medium text-slate-900">{t.label}</span>
                                <span className="block truncate font-mono text-[10px] text-slate-500">{t.slug}</span>
                              </div>
                              <div className="flex shrink-0 gap-1">
                                <button
                                  type="button"
                                  onClick={() => openEditTag(t)}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteTag(t, t.label)}
                                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-red-600 hover:bg-red-50"
                                >
                                  Del
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
