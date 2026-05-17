'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { exportToN8n } from '@/app/lib/workflows/n8n/export'
import { importFromN8n } from '@/app/lib/workflows/n8n/import'
import type { N8nCatalogEntry } from '@/app/lib/workflows/n8n/catalog-mappings'
import { definitionToDraft } from '@/app/lib/workflows/sync'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'

export function WorkflowN8nToolbar({
  campaignName,
  draft,
  onDraftChange,
  onToast,
}: {
  campaignName: string
  draft: WorkflowEditorDraft
  onDraftChange: (d: WorkflowEditorDraft) => void
  onToast: (type: 'success' | 'error', msg: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [catalog, setCatalog] = useState<N8nCatalogEntry[]>(
    BUILTIN_WORKFLOW_NODE_TYPES.map((t) => ({
      slug: t.slug,
      n8n_type: t.n8n_type,
      label: t.label,
      handler_key: t.handler_key,
      n8n_type_version: t.n8n_type_version,
      n8n_parameters: t.n8n_parameters,
    }))
  )

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/workflow/node-types', { cache: 'no-store' })
        const json = await res.json()
        if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
          setCatalog(
            json.data.map((t: N8nCatalogEntry) => ({
              slug: t.slug,
              n8n_type: t.n8n_type,
              label: t.label,
              handler_key: t.handler_key,
              n8n_type_version: t.n8n_type_version,
              n8n_parameters: t.n8n_parameters,
            }))
          )
        }
      } catch {
        /* builtin fallback */
      }
    })()
  }, [])

  const currentDef = useCallback((): WorkflowDefinition => {
    return (
      (draft.definition as WorkflowDefinition | undefined) ?? {
        version: 1,
        nodes: [],
        edges: [],
      }
    )
  }, [draft.definition])

  const applyImport = useCallback(
    (raw: unknown, mode: 'replace' | 'merge') => {
      try {
        const base = mode === 'merge' ? currentDef() : undefined
        const { definition, warnings } = importFromN8n(raw, {
          catalog,
          mergeInto: base,
        })
        onDraftChange(definitionToDraft(definition))
        onToast(
          'success',
          warnings.length
            ? mode === 'merge'
              ? `Pasted with ${warnings.length} warning(s)`
              : `Imported with ${warnings.length} warning(s)`
            : mode === 'merge'
              ? 'Pasted from n8n'
              : 'Imported from n8n'
        )
      } catch (e: unknown) {
        onToast('error', e instanceof Error ? e.message : 'Import failed')
      }
    },
    [catalog, currentDef, onDraftChange, onToast]
  )

  const exportJson = () => {
    const def = currentDef()
    const n8n = exportToN8n(def, campaignName || 'CRM Campaign', catalog)
    void navigator.clipboard.writeText(JSON.stringify(n8n, null, 2))
    onToast('success', 'n8n workflow JSON copied — paste in n8n or share')
  }

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText()
      const json = JSON.parse(text) as unknown
      const nodeCount =
        json && typeof json === 'object' && 'nodes' in json && Array.isArray((json as { nodes: unknown[] }).nodes)
          ? (json as { nodes: unknown[] }).nodes.length
          : 1
      applyImport(json, nodeCount <= 2 && currentDef().nodes.length > 0 ? 'merge' : 'replace')
    } catch (e: unknown) {
      onToast('error', e instanceof Error ? e.message : 'Paste failed — copy n8n JSON first')
    }
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      applyImport(json, 'replace')
    } catch (e: unknown) {
      onToast('error', e instanceof Error ? e.message : 'Import failed')
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={exportJson}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Copy workflow as n8n JSON (paste into n8n canvas)"
      >
        Copy n8n
      </button>
      <button
        type="button"
        onClick={() => void pasteFromClipboard()}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Paste n8n JSON from clipboard onto this canvas"
      >
        Paste n8n
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        title="Import n8n workflow JSON file"
      >
        Import file
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void importFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}
