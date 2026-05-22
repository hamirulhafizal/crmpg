'use client'

export function WorkflowUndoButtons({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  compact = false,
}: {
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  /** Icon-only buttons for narrow mobile toolbar rows. */
  compact?: boolean
}) {
  const btnClass = compact
    ? 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'
    : 'inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={!canUndo}
        onClick={onUndo}
        title="Undo (Ctrl+Z / ⌘Z)"
        className={btnClass}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
        </svg>
        {!compact ? <span className="hidden sm:inline">Undo</span> : null}
      </button>
      <button
        type="button"
        disabled={!canRedo}
        onClick={onRedo}
        title="Redo (Ctrl+Shift+Z / ⌘⇧Z)"
        className={btnClass}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l6-6m0 0l-6-6m6 6H9a6 6 0 000 12h3" />
        </svg>
        {!compact ? <span className="hidden sm:inline">Redo</span> : null}
      </button>
    </div>
  )
}
