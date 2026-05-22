'use client'

import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import {
  copyNodesFromDefinition,
  loadWorkflowClipboardFromStorage,
  parseWorkflowClipboardJson,
  pasteNodesIntoDefinition,
  persistWorkflowClipboard,
  type WorkflowClipboardPayload,
} from '@/app/lib/workflows/clipboard'
import { removeNodeFromDefinition } from '@/app/lib/workflows/graph-mutate'
import { parsePastedWorkflowText } from '@/app/lib/workflows/parse-workflow-paste'
import { definitionToDraft, draftToDefinition } from '@/app/lib/workflows/sync'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function readWorkflowClipboardFromText(text: string): WorkflowClipboardPayload | null {
  return parseWorkflowClipboardJson(text)
}

export function useWorkflowNodeClipboard({
  editable,
  draft,
  setDraft,
  selectedNodeIds,
  setSelectedNodeIds,
  onToast,
}: {
  editable: boolean
  draft: WorkflowEditorDraft
  setDraft: Dispatch<SetStateAction<WorkflowEditorDraft>>
  selectedNodeIds: string[]
  setSelectedNodeIds: Dispatch<SetStateAction<string[]>>
  onToast?: (type: 'success' | 'error', text: string) => void
}) {
  const clipboardRef = useRef<WorkflowClipboardPayload | null>(null)
  const pasteCountRef = useRef(0)

  const currentDefinition = useCallback(() => {
    const d = draft
    if (d.definition?.nodes?.length) {
      return {
        version: 1 as const,
        nodes: d.definition.nodes,
        edges: d.definition.edges ?? [],
      }
    }
    return draftToDefinition(d)
  }, [draft])

  const copySelected = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      onToast?.('error', 'Select a node to copy')
      return
    }
    const payload = copyNodesFromDefinition(currentDefinition(), selectedNodeIds)
    if (!payload) {
      onToast?.('error', 'Nothing to copy')
      return
    }
    clipboardRef.current = payload
    pasteCountRef.current = 0
    persistWorkflowClipboard(payload)
    const edgeNote =
      payload.edges?.length && payload.edges.length > 0
        ? ` (${payload.edges.length} connection${payload.edges.length === 1 ? '' : 's'})`
        : ''
    const label =
      selectedNodeIds.length === 1
        ? `Node copied${edgeNote} — paste in this or another workflow (Ctrl+V)`
        : `${selectedNodeIds.length} nodes copied${edgeNote} — paste in this or another workflow (Ctrl+V)`
    onToast?.('success', label)
  }, [currentDefinition, selectedNodeIds, onToast])

  const deleteSelected = useCallback(() => {
    if (selectedNodeIds.length === 0) {
      onToast?.('error', 'Select a node to delete')
      return
    }
    const ids = new Set(selectedNodeIds)
    setDraft((d) => {
      let def = currentDefinition()
      for (const id of ids) {
        if (def.nodes.some((n) => n.id === id)) {
          def = removeNodeFromDefinition(def, id)
        }
      }
      return definitionToDraft(def)
    })
    setSelectedNodeIds([])
    clipboardRef.current = null
    pasteCountRef.current = 0
    onToast?.('success', selectedNodeIds.length === 1 ? 'Node deleted' : `${selectedNodeIds.length} nodes deleted`)
  }, [selectedNodeIds, setDraft, setSelectedNodeIds, onToast, currentDefinition])

  const pasteNodesPayload = useCallback(
    (payload: WorkflowClipboardPayload) => {
      pasteCountRef.current += 1
      const stagger = pasteCountRef.current
      let pastedStepOrders: number[] = []
      let newNodeIds: string[] = []
      setDraft((d) => {
        const def =
          d.definition?.nodes?.length
            ? {
                version: 1 as const,
                nodes: d.definition.nodes,
                edges: d.definition.edges ?? [],
              }
            : draftToDefinition(d)
        const result = pasteNodesIntoDefinition(def, payload, {
          x: 56 * stagger,
          y: 48 * stagger,
        })
        pastedStepOrders = result.pastedStepOrders
        newNodeIds = result.newNodeIds
        return definitionToDraft(result.definition)
      })
      setSelectedNodeIds(newNodeIds)
      const order = pastedStepOrders[0]
      onToast?.(
        'success',
        newNodeIds.length > 1
          ? `Pasted ${newNodeIds.length} nodes`
          : order
            ? `Pasted as Step ${order}`
            : 'Node pasted'
      )
    },
    [setDraft, setSelectedNodeIds, onToast]
  )

  const pasteWorkflowDefinition = useCallback(
    (text: string) => {
      const existing = currentDefinition()
      const merge = existing.nodes.length > 0
      const stagger = pasteCountRef.current + 1
      const parsed = parsePastedWorkflowText(text, {
        mergeInto: merge ? existing : undefined,
        mergeOffset: merge ? { x: 56 * stagger, y: 48 * stagger } : undefined,
      })
      if (!parsed) return false
      const { definition, warnings, source } = parsed
      setDraft(definitionToDraft(definition))
      setSelectedNodeIds(definition.nodes.map((n) => n.id))
      const label =
        source === 'n8n'
          ? warnings.length
            ? `Imported n8n workflow (${definition.nodes.length} nodes, ${warnings.length} warning(s))`
            : `Imported n8n workflow (${definition.nodes.length} nodes)`
          : `Pasted workflow (${definition.nodes.length} nodes)`
      onToast?.('success', `${label} — Ctrl+Z to undo`)
      return true
    },
    [setDraft, setSelectedNodeIds, onToast, currentDefinition]
  )

  const pasteFromClipboard = useCallback(async () => {
    const tryNodePayload = (payload: WorkflowClipboardPayload | null) => {
      if (payload?.nodes.length) {
        clipboardRef.current = payload
        pasteNodesPayload(payload)
        return true
      }
      return false
    }

    if (clipboardRef.current?.nodes.length && tryNodePayload(clipboardRef.current)) {
      return
    }

    const fromStorage = loadWorkflowClipboardFromStorage()
    if (fromStorage?.nodes.length && tryNodePayload(fromStorage)) {
      return
    }

    let text = ''
    try {
      text = await navigator.clipboard.readText()
    } catch {
      onToast?.('error', 'Allow clipboard access to paste, or copy nodes first (Ctrl+C)')
      return
    }

    const trimmed = text.trim()
    if (trimmed) {
      if (pasteWorkflowDefinition(trimmed)) return
      if (tryNodePayload(readWorkflowClipboardFromText(trimmed))) return
    }

    onToast?.('error', 'Nothing to paste — copy a node (Ctrl+C) or workflow JSON')
  }, [pasteNodesPayload, pasteWorkflowDefinition, onToast])

  const selectAllNodes = useCallback(() => {
    const ids = currentDefinition().nodes.map((n) => n.id)
    if (ids.length === 0) {
      onToast?.('error', 'No nodes on canvas')
      return
    }
    setSelectedNodeIds(ids)
  }, [currentDefinition, setSelectedNodeIds, onToast])

  useEffect(() => {
    if (!editable) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.length === 0) return
        e.preventDefault()
        deleteSelected()
        return
      }

      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const key = e.key.toLowerCase()
      if (key === 'a') {
        e.preventDefault()
        selectAllNodes()
      } else if (key === 'c') {
        if (selectedNodeIds.length === 0) return
        e.preventDefault()
        copySelected()
      } else if (key === 'v') {
        e.preventDefault()
        void pasteFromClipboard()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    editable,
    selectedNodeIds,
    copySelected,
    pasteFromClipboard,
    deleteSelected,
    selectAllNodes,
  ])

  return { copySelected, pasteFromClipboard, deleteSelected, selectAllNodes }
}
