'use client'

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'

const MAX_HISTORY = 50

function cloneDraft(d: WorkflowEditorDraft): WorkflowEditorDraft {
  return structuredClone(d)
}

function draftsEqual(a: WorkflowEditorDraft, b: WorkflowEditorDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  return target.isContentEditable
}

export function useWorkflowDraftHistory(
  initialDraft: WorkflowEditorDraft | undefined,
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled !== false

  const [draft, setDraftState] = useState<WorkflowEditorDraft>(() => initialDraft!)
  const undoStack = useRef<WorkflowEditorDraft[]>([])
  const redoStack = useRef<WorkflowEditorDraft[]>([])
  const applyingHistory = useRef(false)
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncFlags = useCallback(() => {
    setCanUndo(undoStack.current.length > 0)
    setCanRedo(redoStack.current.length > 0)
  }, [])

  const resetHistory = useCallback(
    (next: WorkflowEditorDraft) => {
      applyingHistory.current = true
      setDraftState(next)
      undoStack.current = []
      redoStack.current = []
      applyingHistory.current = false
      syncFlags()
    },
    [syncFlags]
  )

  const initialKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (!initialDraft) return
    const key = JSON.stringify(initialDraft)
    if (key === initialKeyRef.current) return
    initialKeyRef.current = key
    resetHistory(initialDraft)
  }, [initialDraft, resetHistory])

  const setDraft: Dispatch<SetStateAction<WorkflowEditorDraft>> = useCallback(
    (action) => {
      setDraftState((prev) => {
        const next = typeof action === 'function' ? action(prev) : action
        if (draftsEqual(prev, next)) return prev
        if (enabled && !applyingHistory.current) {
          undoStack.current.push(cloneDraft(prev))
          if (undoStack.current.length > MAX_HISTORY) undoStack.current.shift()
          redoStack.current = []
        }
        return next
      })
      queueMicrotask(syncFlags)
    },
    [enabled, syncFlags]
  )

  const undo = useCallback(() => {
    if (!enabled || undoStack.current.length === 0) return
    applyingHistory.current = true
    setDraftState((prev) => {
      const past = undoStack.current.pop()!
      redoStack.current.push(cloneDraft(prev))
      return past
    })
    applyingHistory.current = false
    syncFlags()
  }, [enabled, syncFlags])

  const redo = useCallback(() => {
    if (!enabled || redoStack.current.length === 0) return
    applyingHistory.current = true
    setDraftState((prev) => {
      const future = redoStack.current.pop()!
      undoStack.current.push(cloneDraft(prev))
      return future
    })
    applyingHistory.current = false
    syncFlags()
  }, [enabled, syncFlags])

  useEffect(() => {
    if (!enabled) return

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) {
        if (undoStack.current.length === 0) return
        e.preventDefault()
        undo()
      } else if (key === 'z' && e.shiftKey) {
        if (redoStack.current.length === 0) return
        e.preventDefault()
        redo()
      } else if (key === 'y' && !e.shiftKey) {
        // Windows redo
        if (redoStack.current.length === 0) return
        e.preventDefault()
        redo()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [enabled, undo, redo])

  return {
    draft,
    setDraft,
    resetHistory,
    undo,
    redo,
    canUndo,
    canRedo,
  }
}
