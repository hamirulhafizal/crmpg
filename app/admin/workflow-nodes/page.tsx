'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportN8nNodeSnippet } from '@/app/lib/workflows/n8n/node-snippet'
import { parseN8nClipboard } from '@/app/lib/workflows/n8n/parse-clipboard'
import { n8nTypeFromPaste, validateWorkflowNodeTypeInput } from '@/app/lib/workflows/node-type-validate'
import type { WorkflowNodeCategory, WorkflowNodeTypeRow } from '@/app/lib/workflows/types'

const CATEGORIES: WorkflowNodeCategory[] = ['trigger', 'logic', 'action', 'integration', 'flow']
const HANDLERS = ['trigger', 'audience', 'enroll', 'whatsapp_send', 'complete', 'noop'] as const

const EMPTY_FORM = {
  slug: '',
  category: 'action' as WorkflowNodeCategory,
  label: '',
  description: '',
  icon: '',
  handler_key: 'noop',
  n8n_type: '',
  n8n_type_version: 1,
  n8n_parameters: '{}',
  parameter_schema: '{}',
  enabled: true,
  sort_order: 100,
}

type FormState = typeof EMPTY_FORM

function parseJsonField(raw: string, field: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw) as unknown
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      throw new Error(`${field} must be a JSON object`)
    }
    return v as Record<string, unknown>
  } catch (e) {
    throw new Error(e instanceof Error ? `${field}: ${e.message}` : `Invalid ${field} JSON`)
  }
}

export default function AdminWorkflowNodesPage() {
  const [rows, setRows] = useState<WorkflowNodeTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [pasteJson, setPasteJson] = useState('')
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg })
    window.setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/workflow-node-types', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to load')
      setRows(json.data as WorkflowNodeTypeRow[])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const editingRow = useMemo(
    () => (editingId ? rows.find((r) => r.id === editingId) : null),
    [editingId, rows]
  )

  const selectedRows = useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds]
  )

  const allSelected = rows.length > 0 && selectedIds.size === rows.length
  const someSelected = selectedIds.size > 0 && !allSelected

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)))
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setPasteJson('')
    setFormOpen(true)
  }

  const openEdit = (row: WorkflowNodeTypeRow) => {
    setEditingId(row.id)
    setForm({
      slug: row.slug,
      category: row.category,
      label: row.label,
      description: row.description ?? '',
      icon: row.icon ?? '',
      handler_key: row.handler_key,
      n8n_type: row.n8n_type ?? '',
      n8n_type_version: row.n8n_type_version ?? 1,
      n8n_parameters: JSON.stringify(row.n8n_parameters ?? {}, null, 2),
      parameter_schema: JSON.stringify(row.parameter_schema ?? {}, null, 2),
      enabled: row.enabled,
      sort_order: row.sort_order,
    })
    setPasteJson('')
    setFormOpen(true)
  }

  const applyPasteFromN8n = () => {
    try {
      const payload = parseN8nClipboard(JSON.parse(pasteJson))
      const node = payload.nodes[0]
      if (!node) throw new Error('No node found in pasted JSON')
      const { n8n_type, n8n_type_version, n8n_parameters } = n8nTypeFromPaste(node)
      const crmFromMeta =
        typeof node.parameters?._crmType === 'string' ? (node.parameters._crmType as string) : ''
      setForm((f) => ({
        ...f,
        slug: crmFromMeta || f.slug || suggestSlug(n8n_type),
        label: f.label || node.name || n8n_type.split('.').pop() || 'Node',
        n8n_type,
        n8n_type_version,
        n8n_parameters: JSON.stringify(n8n_parameters, null, 2),
      }))
      showToast('ok', 'Filled from n8n node — set CRM slug & handler, then save')
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'Could not parse n8n JSON')
    }
  }

  const copyN8nSnippet = async (row: WorkflowNodeTypeRow) => {
    if (!row.n8n_type) {
      showToast('err', 'Set n8n_type first — required for n8n canvas paste')
      return
    }
    const snippet = exportN8nNodeSnippet({
      slug: row.slug,
      label: row.label,
      handler_key: row.handler_key,
      n8n_type: row.n8n_type,
      n8n_type_version: row.n8n_type_version,
      n8n_parameters: row.n8n_parameters,
    })
    await navigator.clipboard.writeText(JSON.stringify(snippet, null, 2))
    showToast('ok', `Copied n8n node "${row.label}" — paste in n8n with Ctrl+V`)
  }

  const saveForm = async () => {
    setSaving(true)
    try {
      const body = {
        slug: form.slug,
        category: form.category,
        label: form.label,
        description: form.description || null,
        icon: form.icon || null,
        handler_key: form.handler_key,
        n8n_type: form.n8n_type.trim() || null,
        n8n_type_version: form.n8n_type_version,
        n8n_parameters: parseJsonField(form.n8n_parameters, 'n8n_parameters'),
        parameter_schema: parseJsonField(form.parameter_schema, 'parameter_schema'),
        enabled: form.enabled,
        sort_order: form.sort_order,
      }
      const validated = validateWorkflowNodeTypeInput(body, Boolean(editingId))
      if (!validated.ok) throw new Error(validated.error)

      const url = editingId
        ? `/api/admin/workflow-node-types/${editingId}`
        : '/api/admin/workflow-node-types'
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Save failed')
      showToast('ok', editingId ? 'Node type updated' : 'Node type created')
      setFormOpen(false)
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const toggleEnabled = async (row: WorkflowNodeTypeRow) => {
    const res = await fetch(`/api/admin/workflow-node-types/${row.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !row.enabled }),
    })
    const json = await res.json()
    if (!res.ok) {
      showToast('err', json.error ?? 'Update failed')
      return
    }
    await load()
  }

  const removeRow = async (row: WorkflowNodeTypeRow) => {
    if (
      !window.confirm(
        row.is_system
          ? `Disable system node "${row.label}"?`
          : `Delete "${row.label}"?`
      )
    ) {
      return
    }
    const res = await fetch(`/api/admin/workflow-node-types/${row.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!res.ok) {
      showToast('err', json.error ?? 'Delete failed')
      return
    }
    showToast('ok', row.is_system ? 'Disabled' : 'Deleted')
    setSelectedIds((prev) => {
      const next = new Set(prev)
      next.delete(row.id)
      return next
    })
    await load()
  }

  const bulkDelete = async () => {
    if (selectedIds.size === 0) return

    const systemCount = selectedRows.filter((r) => r.is_system).length
    const customCount = selectedRows.length - systemCount
    const parts: string[] = []
    if (customCount > 0) parts.push(`delete ${customCount} custom`)
    if (systemCount > 0) parts.push(`disable ${systemCount} system`)
    const summary = parts.join(' and ')

    if (!window.confirm(`Bulk ${summary} node type(s)? This cannot be undone for custom nodes.`)) {
      return
    }

    setBulkDeleting(true)
    try {
      const res = await fetch('/api/admin/workflow-node-types/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [...selectedIds] }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Bulk delete failed')

      const msgs: string[] = []
      if (json.deleted > 0) msgs.push(`${json.deleted} deleted`)
      if (json.disabled > 0) msgs.push(`${json.disabled} disabled`)
      if (json.not_found?.length > 0) msgs.push(`${json.not_found.length} not found`)
      showToast('ok', msgs.join(', ') || 'Done')
      setSelectedIds(new Set())
      await load()
    } catch (e) {
      showToast('err', e instanceof Error ? e.message : 'Bulk delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Workflow node catalog</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Map CRM nodes to real n8n node types. Copy a node snippet and paste it into n8n, or paste
            from n8n when creating a type. Campaign builder palette and import/export use this catalog.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="shrink-0 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-violet-700"
        >
          Add node type
        </button>
      </div>

      {toast ? (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            toast.type === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'
          }`}
        >
          {toast.msg}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-violet-200 bg-violet-50/80 px-4 py-3">
          <span className="text-sm font-medium text-violet-900">{selectedIds.size} selected</span>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-sm font-medium text-violet-700 hover:text-violet-900"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={bulkDeleting}
            onClick={() => void bulkDelete()}
            className="ml-auto rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60"
          >
            {bulkDeleting ? 'Deleting…' : 'Delete selected'}
          </button>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="w-10 px-3 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected
                  }}
                  onChange={toggleSelectAll}
                  aria-label="Select all"
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
              </th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Label</th>
              <th className="hidden px-4 py-3 text-left font-semibold text-slate-600 md:table-cell">Slug</th>
              <th className="hidden px-4 py-3 text-left font-semibold text-slate-600 lg:table-cell">n8n type</th>
              <th className="px-4 py-3 text-left font-semibold text-slate-600">Handler</th>
              <th className="px-4 py-3 text-right font-semibold text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No node types yet.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className={`${!row.enabled ? 'bg-slate-50/80 opacity-60' : ''} ${
                    selectedIds.has(row.id) ? 'bg-violet-50/50' : ''
                  }`}
                >
                  <td className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => toggleSelect(row.id)}
                      aria-label={`Select ${row.label}`}
                      className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.label}</div>
                    <div className="text-xs text-slate-500 capitalize">{row.category}</div>
                    {row.is_system ? (
                      <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                        system
                      </span>
                    ) : null}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-slate-600 md:table-cell">{row.slug}</td>
                  <td className="hidden max-w-[200px] truncate px-4 py-3 font-mono text-xs text-slate-600 lg:table-cell">
                    {row.n8n_type ?? '—'}
                    {row.n8n_type ? (
                      <span className="ml-1 text-slate-400">v{row.n8n_type_version ?? 1}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{row.handler_key}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => void copyN8nSnippet(row)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                        title="Copy single-node n8n JSON for n8n canvas"
                      >
                        Copy n8n
                      </button>
                      <button
                        type="button"
                        onClick={() => openEdit(row)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(row)}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium hover:bg-slate-50"
                      >
                        {row.enabled ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeRow(row)}
                        className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        {row.is_system ? 'Disable' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-slate-900">
              {editingId ? 'Edit node type' : 'New node type'}
            </h2>
            {editingRow?.is_system ? (
              <p className="mt-1 text-xs text-amber-700">System type — slug cannot be changed.</p>
            ) : null}

            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">
                Paste n8n node JSON (from n8n copy)
                <textarea
                  value={pasteJson}
                  onChange={(e) => setPasteJson(e.target.value)}
                  rows={3}
                  placeholder='{"nodes":[{"type":"n8n-nodes-base.httpRequest",...}]}'
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                />
              </label>
              <button
                type="button"
                onClick={applyPasteFromN8n}
                className="text-xs font-medium text-violet-600 hover:text-violet-800"
              >
                Parse n8n JSON into form
              </button>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  CRM slug
                  <input
                    value={form.slug}
                    onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                    disabled={Boolean(editingRow?.is_system)}
                    placeholder="crm.integration.myNode"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm disabled:bg-slate-50"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Label
                  <input
                    value={form.label}
                    onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Category
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, category: e.target.value as WorkflowNodeCategory }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  n8n type (must match n8n node exactly)
                  <input
                    value={form.n8n_type}
                    onChange={(e) => setForm((f) => ({ ...f, n8n_type: e.target.value }))}
                    placeholder="n8n-nodes-base.httpRequest"
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  n8n typeVersion
                  <input
                    type="number"
                    min={1}
                    step={0.1}
                    value={form.n8n_type_version}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, n8n_type_version: Number(e.target.value) || 1 }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Handler
                  <select
                    value={form.handler_key}
                    onChange={(e) => setForm((f) => ({ ...f, handler_key: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {HANDLERS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs font-medium text-slate-600 sm:col-span-2">
                  n8n default parameters (JSON)
                  <textarea
                    value={form.n8n_parameters}
                    onChange={(e) => setForm((f) => ({ ...f, n8n_parameters: e.target.value }))}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-600">
                  Sort order
                  <input
                    type="number"
                    value={form.sort_order}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                    }
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
                  />
                  Enabled in palette
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveForm()}
                className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-60"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function suggestSlug(n8nType: string): string {
  const tail = n8nType.replace(/^n8n-nodes-base\./i, '').replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  return `crm.n8n.${tail || 'custom'}`
}

