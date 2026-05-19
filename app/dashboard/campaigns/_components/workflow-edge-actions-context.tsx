'use client'

import { createContext, useContext } from 'react'

export type WorkflowEdgeActions = {
  editable: boolean
  deleteEdge: (edgeId: string) => void
  /** Live preview while dragging the loop control (does not write undo history). */
  updateEdgePathOffset: (edgeId: string, pathOffsetY: number) => void
  /** Persist edge layout to campaign draft (call on pointer up). */
  commitEdgesToDraft: () => void
}

const WorkflowEdgeActionsContext = createContext<WorkflowEdgeActions>({
  editable: false,
  deleteEdge: () => {},
  updateEdgePathOffset: () => {},
  commitEdgesToDraft: () => {},
})

export function WorkflowEdgeActionsProvider({
  value,
  children,
}: {
  value: WorkflowEdgeActions
  children: React.ReactNode
}) {
  return <WorkflowEdgeActionsContext.Provider value={value}>{children}</WorkflowEdgeActionsContext.Provider>
}

export function useWorkflowEdgeActions() {
  return useContext(WorkflowEdgeActionsContext)
}
