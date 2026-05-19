'use client'

import { useEffect, useState } from 'react'
import { BUILTIN_WORKFLOW_NODE_TYPES } from '@/app/lib/workflows/catalog'
import type { WorkflowNodeTypeDescriptor } from '@/app/lib/workflows/types'

const ICONS: Record<string, string> = {
  bolt: '⚡',
  clock: '🕐',
  users: '👥',
  database: '⚡',
  loop: '🔁',
  edit: '✎',
  plus: '＋',
  chat: '💬',
  globe: '🌐',
  hourglass: '⏳',
  forward: '»',
  check: '✓',
}

export function WorkflowNodePalette({
  onAddNode,
}: {
  onAddNode: (typeSlug: string) => void
}) {
  const [types, setTypes] = useState<WorkflowNodeTypeDescriptor[]>(BUILTIN_WORKFLOW_NODE_TYPES)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/workflow/node-types', { cache: 'no-store' })
        const json = await res.json()
        if (res.ok && Array.isArray(json.data) && json.data.length > 0) {
          setTypes(json.data as WorkflowNodeTypeDescriptor[])
        }
      } catch {
        /* use builtin */
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-white">
      <div className="border-b border-slate-200 px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Nodes</h2>
        <p className="mt-0.5 text-[11px] text-slate-400">Drag or click to add</p>
      </div>
      <ul className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <li className="px-2 py-4 text-center text-xs text-slate-400">Loading…</li>
        ) : (
          types.map((t) => (
            <li key={t.slug}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/workflow-node-type', t.slug)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onClick={() => onAddNode(t.slug)}
                className="mb-1 flex w-full items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-2.5 py-2 text-left transition-colors hover:border-violet-300 hover:bg-violet-50/50"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-base shadow-sm">
                  {ICONS[t.icon ?? ''] ?? '◆'}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-slate-900">{t.label}</span>
                  {t.description ? (
                    <span className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{t.description}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}
