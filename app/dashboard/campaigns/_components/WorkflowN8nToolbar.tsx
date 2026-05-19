'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { importFromN8n } from '@/app/lib/workflows/n8n/import'
import type { N8nCatalogEntry } from '@/app/lib/workflows/n8n/catalog-mappings'
import { definitionToDraft } from '@/app/lib/workflows/sync'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'
import { createJohorWahaBulkWorkflowDefinition } from '@/app/lib/workflows/templates/johor-bulk-workflow'

/** n8n JSON file import only (node copy/paste uses Ctrl+C / Ctrl+V on the canvas). */
export function WorkflowN8nToolbar({
  draft,
  onDraftChange,
  onToast,
}: {
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

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const json = JSON.parse(text) as unknown
      const { definition, warnings } = importFromN8n(json, { catalog })
      onDraftChange(definitionToDraft(definition))
      onToast(
        'success',
        warnings.length ? `Imported with ${warnings.length} warning(s)` : 'Imported from n8n file'
      )
    } catch (e: unknown) {
      onToast('error', e instanceof Error ? e.message : 'Import failed')
    }
  }

  const loadJohorTemplate = () => {
    onDraftChange(definitionToDraft(createJohorWahaBulkWorkflowDefinition()))
    onToast('success', 'Loaded Johor bulk workflow template')
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={loadJohorTemplate}
        className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-medium text-violet-800 hover:bg-violet-100"
        title="Load n8n-style Johor bulk message workflow on canvas"
      >
        Johor template
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
