'use client'

import type { ReactNode } from 'react'

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      {direction === 'left' ? (
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      ) : (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      )}
    </svg>
  )
}

/** Floating reopen control when panel is hidden (does not take layout width). */
export function WorkflowSidebarFloatingToggle({
  side,
  panelLabel,
  onOpen,
}: {
  side: 'left' | 'right'
  panelLabel: string
  onOpen: () => void
}) {
  const isLeft = side === 'left'
  const title = `Show ${panelLabel.toLowerCase()}`

  return (
    <button
      type="button"
      onClick={onOpen}
      title={title}
      aria-label={title}
      className={`absolute top-3 z-30 flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 py-1.5 text-xs font-medium text-slate-600 shadow-md backdrop-blur-sm transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 ${
        isLeft ? 'left-3 pl-2 pr-2.5' : 'right-3 pl-2.5 pr-2'
      }`}
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white">
        <ChevronIcon direction={isLeft ? 'right' : 'left'} />
      </span>
      <span className="hidden sm:inline">{panelLabel}</span>
    </button>
  )
}

export function WorkflowCollapsibleSidebar({
  side,
  open,
  onToggle,
  panelLabel,
  children,
  className = '',
}: {
  side: 'left' | 'right'
  open: boolean
  onToggle: () => void
  panelLabel: string
  children: ReactNode
  className?: string
}) {
  if (!open) return null

  const isLeft = side === 'left'
  const collapseTitle = `Hide ${panelLabel.toLowerCase()}`

  return (
    <div
      className={`relative flex h-full min-h-0 shrink-0 flex-col border-slate-200 bg-white ${
        isLeft ? 'border-r' : 'border-l'
      } ${className}`}
    >
      <button
        type="button"
        onClick={onToggle}
        title={collapseTitle}
        aria-label={collapseTitle}
        className={`absolute top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition-colors hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800 ${
          isLeft ? 'right-0 translate-x-1/2' : 'left-0 -translate-x-1/2'
        }`}
      >
        <ChevronIcon direction={isLeft ? 'left' : 'right'} />
      </button>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  )
}
