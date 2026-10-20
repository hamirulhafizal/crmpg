'use client'

import { ControlButton, useReactFlow } from '@xyflow/react'
import { useWorkflowCanvasTheme } from '@/app/dashboard/campaigns/_components/workflow-canvas-theme'

function LayoutIcon({ vertical }: { vertical: boolean }) {
  if (vertical) {
    return (
      <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
      </svg>
    )
  }
  return (
    <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" d="M6 8v13M12 8v13M18 8v13M6 3h.01M12 3h.01M18 3h.01" />
    </svg>
  )
}

/** Canvas control (mobile): toggle vertical vs horizontal tidy layout — not persisted until Save. */
export function WorkflowCanvasLayoutToggle({
  vertical,
  disabled,
  onToggle,
}: {
  vertical: boolean
  disabled?: boolean
  onToggle: () => void
}) {
  const { isDark } = useWorkflowCanvasTheme()
  const { fitView } = useReactFlow()

  const handleClick = () => {
    if (disabled) return
    onToggle()
    window.setTimeout(() => {
      void fitView({ padding: 0.22, duration: 280 })
    }, 80)
  }

  const title = vertical ? 'Switch to horizontal layout' : 'Align nodes vertically (portrait)'

  return (
    <ControlButton
      type="button"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={vertical}
      title={title}
      aria-label={title}
      className={`workflow-layout-toggle disabled:!opacity-40 ${
        isDark
          ? 'workflow-canvas-control-dark !text-white hover:!text-slate-200'
          : 'workflow-canvas-control-light !text-slate-700 hover:!text-slate-900'
      }`}
    >
      <LayoutIcon vertical={vertical} />
    </ControlButton>
  )
}
