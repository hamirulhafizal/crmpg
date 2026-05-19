'use client'

import { useCallback } from 'react'
import { ControlButton, useReactFlow } from '@xyflow/react'
import type { WorkflowEditorDraft } from '@/app/lib/campaigns/workflow-layout'
import { tidyWorkflowDefinition } from '@/app/lib/workflows/tidy-layout'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'

function BroomIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 20l7-7" />
      <path d="M11 13l8-8 2 2-8 8-3-2z" />
      <path d="M17 5l2 2" />
    </svg>
  )
}

export function WorkflowCanvasTidyButton({
  draft,
  vertical,
  editable,
  onTidyLayout,
}: {
  draft: WorkflowEditorDraft
  vertical: boolean
  editable: boolean
  onTidyLayout: (def: WorkflowDefinition) => void
}) {
  const { fitView } = useReactFlow()

  const handleTidy = useCallback(() => {
    if (!editable || !draft.definition?.nodes.length) return
    const tidied = tidyWorkflowDefinition(draft.definition, { vertical })
    onTidyLayout(tidied)
    window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 280 })
    }, 80)
  }, [draft.definition, editable, fitView, onTidyLayout, vertical])

  if (!editable) return null

  return (
    <ControlButton
      type="button"
      onClick={handleTidy}
      title="Tidy up layout"
      aria-label="Tidy up layout"
      className="!text-slate-700 hover:!text-slate-900"
    >
      <BroomIcon className="h-[18px] w-[18px]" />
    </ControlButton>
  )
}
