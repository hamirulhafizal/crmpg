'use client'

import { motion } from 'framer-motion'
import type { PgSyncUiStep, PgSyncUiStepState } from '@/app/lib/pg-sync/step-ui'

function StepIcon({ state }: { state: PgSyncUiStepState }) {
  if (state === 'done') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-600 text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    )
  }
  if (state === 'error') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    )
  }
  if (state === 'active') {
    return (
      <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-40" />
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-white">
          <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-90"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </span>
      </span>
    )
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-slate-300 bg-white text-slate-400">
      <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
    </span>
  )
}

type Props = {
  steps: PgSyncUiStep[]
  activity?: Array<{ key: string; label: string; error?: boolean }>
}

export function PgSyncStepTimeline({ steps, activity = [] }: Props) {
  return (
    <div className="space-y-3">
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const isLast = index === steps.length - 1
          const isActive = step.state === 'active'

          return (
            <li key={step.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!isLast ? (
                <span
                  className={`absolute left-3 top-6 -ml-px h-[calc(100%-0.5rem)] w-0.5 ${
                    step.state === 'done' ? 'bg-green-300' : 'bg-slate-200'
                  }`}
                  aria-hidden
                />
              ) : null}

              <StepIcon state={step.state} />

              <div className="min-w-0 flex-1 pt-0.5">
                <p
                  className={`text-sm font-medium ${
                    isActive
                      ? 'text-indigo-900'
                      : step.state === 'done'
                        ? 'text-slate-800'
                        : step.state === 'error'
                          ? 'text-red-800'
                          : 'text-slate-500'
                  }`}
                >
                  {step.label}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                {step.detail ? (
                  <motion.p
                    key={step.detail}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`mt-2 rounded-lg px-2.5 py-2 text-xs leading-relaxed ${
                      isActive
                        ? 'border border-indigo-200 bg-indigo-50 text-indigo-900'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {step.detail}
                  </motion.p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>

      {activity.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Recent activity
          </p>
          <ul className="mt-2 max-h-28 space-y-1.5 overflow-y-auto">
            {activity.map((item) => (
              <li
                key={item.key}
                className={`text-xs leading-snug ${item.error ? 'text-red-700' : 'text-slate-600'}`}
              >
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}

type SnapshotProps = {
  headline: string
  detail: string | null
  stepLabel: string | null
}

export function PgSyncLiveSnapshotCard({ headline, detail, stepLabel }: SnapshotProps) {
  return (
    <div className="rounded-xl border border-indigo-200 bg-gradient-to-br from-indigo-50 to-white px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600/10 text-indigo-700">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-600" />
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{headline}</p>
          {detail ? (
            <motion.p
              key={detail}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 text-sm leading-relaxed text-slate-600"
            >
              {detail}
            </motion.p>
          ) : null}
          {stepLabel ? (
            <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-indigo-600/80">
              {stepLabel}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
