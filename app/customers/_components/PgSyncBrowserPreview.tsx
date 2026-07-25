'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { PgSyncStepScreenshot } from '@/app/lib/pg-sync/screenshots'

type Props = {
  liveSrc: string | null
  steps: PgSyncStepScreenshot[]
  browserLiveUrl?: string | null
  loading?: boolean
  headline?: string | null
}

function BrowserFrame({
  src,
  alt,
  badge,
}: {
  src: string
  alt: string
  badge?: string
}) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-inner">
      {badge ? (
        <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full bg-red-600/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" aria-hidden />
          {badge}
        </span>
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className="block w-full object-contain object-top bg-slate-950" />
    </div>
  )
}

function Placeholder({ loading }: { loading?: boolean }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center">
      {loading ? (
        <>
          <svg className="h-6 w-6 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <p className="mt-3 text-sm text-slate-600">Loading browser view…</p>
        </>
      ) : (
        <>
          <svg className="h-8 w-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          <p className="mt-3 text-sm text-slate-600">Browser snapshot will appear when automation starts</p>
        </>
      )}
    </div>
  )
}

export function PgSyncBrowserPreview({
  liveSrc,
  steps,
  browserLiveUrl,
  loading,
  headline,
}: Props) {
  const stepsWithImages = useMemo(
    () => steps.filter((s) => Boolean(s.screenshotSrc)),
    [steps]
  )
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const selected =
    stepsWithImages.find((s) => s.key === selectedKey) ??
    stepsWithImages[stepsWithImages.length - 1] ??
    null

  const mainSrc = selected?.screenshotSrc ?? liveSrc
  const mainLabel = selected?.label ?? headline ?? 'Live browser'
  const isLive = !selected || selected.key.startsWith('live-') || selected === stepsWithImages[stepsWithImages.length - 1]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Browser view</p>
        {browserLiveUrl ? (
          <a
            href={browserLiveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
          >
            Watch live ↗
          </a>
        ) : null}
      </div>

      {mainSrc ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block w-full text-left transition-opacity hover:opacity-95"
          aria-label="Expand browser screenshot"
        >
          <BrowserFrame
            src={mainSrc}
            alt={mainLabel}
            badge={isLive && liveSrc === mainSrc ? 'Live' : undefined}
          />
          <p className="mt-1.5 truncate text-xs text-slate-500">{mainLabel}</p>
        </button>
      ) : (
        <Placeholder loading={loading} />
      )}

      {stepsWithImages.length > 1 ? (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Step snapshots
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stepsWithImages.map((step) => {
              const active = selected?.key === step.key || (!selected && step.screenshotSrc === liveSrc)
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setSelectedKey(step.key)}
                  className={`shrink-0 overflow-hidden rounded-lg border-2 transition-all ${
                    active ? 'border-indigo-600 ring-2 ring-indigo-600/20' : 'border-slate-200 hover:border-slate-300'
                  }`}
                  title={`Step ${step.step}: ${step.label}`}
                >
                  {step.screenshotSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.screenshotSrc}
                      alt={step.label}
                      className="h-16 w-24 object-cover object-top bg-slate-900"
                    />
                  ) : null}
                  <span className="block w-24 truncate bg-white px-1 py-0.5 text-[10px] text-slate-600">
                    {step.step}. {step.label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      <AnimatePresence>
        {expanded && mainSrc ? (
          <motion.div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/80 p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
          >
            <motion.div
              className="relative max-h-[90vh] max-w-4xl w-full"
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="absolute -top-10 right-0 rounded-lg px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
              >
                Close
              </button>
              <BrowserFrame src={mainSrc} alt={mainLabel} badge={isLive ? 'Live' : undefined} />
              <p className="mt-2 text-center text-sm text-white/90">{mainLabel}</p>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
