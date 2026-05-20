'use client'

import { ControlButton } from '@xyflow/react'
import { useWorkflowCanvasTheme } from '@/app/dashboard/campaigns/_components/workflow-canvas-theme'

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  )
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"
      />
    </svg>
  )
}

export function WorkflowCanvasThemeToggle() {
  const { isDark, toggleTheme } = useWorkflowCanvasTheme()
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode'

  return (
    <ControlButton
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className="!text-slate-700 hover:!text-slate-900"
    >
      {isDark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </ControlButton>
  )
}
