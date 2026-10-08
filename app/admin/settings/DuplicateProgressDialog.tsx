'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export type DuplicateProgressState = {
  open: boolean
  sourceName: string
  percent: number
  label: string
  error: string | null
  done: boolean
}

type Props = {
  state: DuplicateProgressState
  onClose: () => void
}

export function DuplicateProgressDialog({ state, onClose }: Props) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!state.open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [state.open])

  useEffect(() => {
    if (!state.open || !state.done || state.error) return
    const timer = window.setTimeout(() => onClose(), 1400)
    return () => window.clearTimeout(timer)
  }, [state.open, state.done, state.error, onClose])

  if (!mounted) return null

  const canDismiss = Boolean(state.error || state.done)

  return createPortal(
    <AnimatePresence>
      {state.open ? (
        <motion.div
          key="duplicate-progress-dialog"
          className="fixed inset-0 z-[110] isolate flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            role="presentation"
            aria-hidden
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={canDismiss ? onClose : undefined}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-progress-title"
            aria-describedby="duplicate-progress-desc"
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 6 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          >
            <div className="mb-5 flex items-start gap-3">
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                  state.error
                    ? 'bg-red-50 text-red-600'
                    : state.done
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                {state.error ? (
                  <ErrorIcon />
                ) : state.done ? (
                  <CheckIcon />
                ) : (
                  <SpinnerIcon />
                )}
              </div>
              <div className="min-w-0">
                <h2 id="duplicate-progress-title" className="text-lg font-semibold text-slate-900">
                  {state.error
                    ? 'Duplication failed'
                    : state.done
                      ? 'Duplication complete'
                      : 'Duplicating workflow'}
                </h2>
                <p id="duplicate-progress-desc" className="mt-1 text-sm text-slate-600">
                  {state.error ? (
                    state.error
                  ) : (
                    <>
                      <span className="font-medium text-slate-800">{state.sourceName}</span>
                      {state.done ? ' was copied successfully.' : ' — please wait…'}
                    </>
                  )}
                </p>
              </div>
            </div>

            {!state.error ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-800">{state.label}</span>
                  <span className="tabular-nums text-slate-500">{Math.min(100, Math.round(state.percent))}%</span>
                </div>
                <div
                  className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.min(100, Math.round(state.percent))}
                  aria-label="Duplication progress"
                >
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                      state.done ? 'bg-emerald-500' : 'bg-indigo-600'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, state.percent))}%` }}
                  />
                </div>
              </div>
            ) : null}

            {canDismiss ? (
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  {state.error ? 'Close' : 'Done'}
                </button>
              </div>
            ) : (
              <p className="mt-4 text-xs text-slate-400">This may take a few seconds for templates with media.</p>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body
  )
}

function SpinnerIcon() {
  return (
    <svg className="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  )
}

function ErrorIcon() {
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
      />
    </svg>
  )
}
