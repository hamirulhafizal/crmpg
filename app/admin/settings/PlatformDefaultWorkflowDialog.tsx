'use client'

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type {
  PlatformCampaignDefault,
  PlatformDefaultTier,
} from '@/app/lib/campaigns/platform-defaults'

type Props = {
  open: boolean
  templateId: string | null
  onClose: () => void
  onSaved: () => void
  onOpenWorkflowCanvas: (defaults: PlatformCampaignDefault) => void
}

const overlayMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

const desktopPanelMotion = {
  initial: { opacity: 0, y: 24, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: 16, scale: 0.98 },
}

const mobilePanelMotion = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%' },
}

function useMobileViewport(maxWidth = 639): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches
  })

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`)
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [maxWidth])

  return isMobile
}

function DialogSkeleton() {
  return (
    <div className="space-y-5 animate-pulse" aria-hidden>
      <div className="h-6 w-48 rounded-lg bg-slate-200" />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <div className="h-3 w-16 rounded bg-slate-200" />
          <div className="h-10 rounded-xl bg-slate-200" />
        </div>
        <div className="space-y-2">
          <div className="h-3 w-12 rounded bg-slate-200" />
          <div className="h-10 rounded-xl bg-slate-200" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="h-3 w-24 rounded bg-slate-200" />
        <div className="h-24 rounded-xl bg-slate-200" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="h-16 rounded-xl bg-slate-100" />
        <div className="h-16 rounded-xl bg-slate-100" />
      </div>
      <div className="h-28 rounded-xl bg-slate-100" />
    </div>
  )
}

function WorkflowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h4m-4 6h4" />
    </svg>
  )
}

function applyDefaultsToForm(full: PlatformCampaignDefault) {
  return {
    name: full.name,
    description: full.description ?? '',
    tier: full.tier,
  }
}

export function PlatformDefaultWorkflowDialog({
  open,
  templateId,
  onClose,
  onSaved,
  onOpenWorkflowCanvas,
}: Props) {
  const isMobile = useMobileViewport()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaults, setDefaults] = useState<PlatformCampaignDefault | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [tier, setTier] = useState<PlatformDefaultTier>('free')

  const reset = useCallback(() => {
    setLoading(false)
    setSaving(false)
    setError(null)
    setDefaults(null)
    setName('')
    setDescription('')
    setTier('free')
  }, [])

  useEffect(() => {
    if (!open || !templateId) return

    let cancelled = false
    setLoading(true)
    setError(null)
    setDefaults(null)

    void (async () => {
      try {
        const res = await fetch(
          `/api/admin/campaign-workflow-defaults?id=${encodeURIComponent(templateId)}`,
          { cache: 'no-store' }
        )
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        if (!res.ok) {
          setError(typeof data.error === 'string' ? data.error : 'Failed to load template')
          return
        }
        const full = data.data as PlatformCampaignDefault | undefined
        if (!full) {
          setError('Failed to load template')
          return
        }
        setDefaults(full)
        const form = applyDefaultsToForm(full)
        setName(form.name)
        setDescription(form.description)
        setTier(form.tier)
      } catch {
        if (!cancelled) setError('Failed to load template')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, templateId])

  const buildDraftDefaults = (): PlatformCampaignDefault | null => {
    if (!defaults) return null
    return {
      ...defaults,
      name: name.trim() || defaults.name,
      description: description.trim() || null,
      tier,
    }
  }

  const handleSave = async () => {
    if (!defaults) return
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('Name is required')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/campaign-workflow-defaults', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: defaults.id,
          name: trimmedName,
          description: description.trim() || null,
          tier,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to save template')
        return
      }
      const updated = data.data as PlatformCampaignDefault | undefined
      if (updated) {
        setDefaults(updated)
        const form = applyDefaultsToForm(updated)
        setName(form.name)
        setDescription(form.description)
        setTier(form.tier)
      }
      onSaved()
    } catch {
      setError('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const isDirty = (() => {
    if (!defaults) return false
    const form = applyDefaultsToForm(defaults)
    return (
      name.trim() !== form.name ||
      description.trim() !== form.description ||
      tier !== form.tier
    )
  })()

  return (
    <AnimatePresence onExitComplete={reset}>
      {open && templateId ? (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end justify-center overflow-hidden p-0 sm:items-center sm:p-4 top-[-2rem]"
          initial={overlayMotion.initial}
          animate={overlayMotion.animate}
          exit={overlayMotion.exit}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            aria-label="Close dialog"
            className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
            initial={overlayMotion.initial}
            animate={overlayMotion.animate}
            exit={overlayMotion.exit}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="platform-default-dialog-title"
            className="relative z-10 flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
            initial={isMobile ? mobilePanelMotion.initial : desktopPanelMotion.initial}
            animate={isMobile ? mobilePanelMotion.animate : desktopPanelMotion.animate}
            exit={isMobile ? mobilePanelMotion.exit : desktopPanelMotion.exit}
            transition={
              isMobile
                ? { type: 'tween', duration: 0.34, ease: [0.32, 0.72, 0, 1] }
                : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }
            }
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-6">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Default workflow
                </p>
                <h2
                  id="platform-default-dialog-title"
                  className="mt-0.5 truncate text-lg font-semibold text-slate-900"
                >
                  {loading ? 'Loading template…' : name || 'Workflow template'}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
              {loading ? (
                <DialogSkeleton />
              ) : error && !defaults ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : defaults ? (
                <div className="space-y-5">
                  {error ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                      {error}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">Name</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-600">Tier</label>
                      <select
                        value={tier}
                        onChange={(e) => setTier(e.target.value === 'pro' ? 'pro' : 'free')}
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold uppercase text-slate-800"
                      >
                        <option value="free">Free</option>
                        <option value="pro">Pro</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-600">
                      Description
                    </label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      placeholder="Explain what this workflow is for. Users will see this on their campaign list."
                      className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Steps</p>
                      <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                        {defaults.compiled_steps.length}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {defaults.workflow_definition?.nodes?.length ?? 0} nodes
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Updated</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {defaults.updated_at
                          ? new Date(defaults.updated_at).toLocaleDateString()
                          : '—'}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                          <WorkflowIcon className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">Workflow canvas</p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            Edit nodes, connections, and message steps in the visual editor.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const draft = buildDraftDefaults()
                          if (draft) onOpenWorkflowCanvas(draft)
                        }}
                        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
                      >
                        <WorkflowIcon className="h-4 w-4" />
                        Open canvas
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={loading || saving || !defaults || !isDirty}
                onClick={() => void handleSave()}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save details'}
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

export function WorkflowPublishIcon({ className }: { className?: string }) {
  return <WorkflowIcon className={className} />
}
