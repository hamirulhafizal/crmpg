'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  clearStoredPgSyncJob,
  readStoredPgSyncJob,
  writeStoredPgSyncJob,
} from '@/app/lib/pg-sync/active-job'
import type { PgSyncJobView, PgSyncJobStatus, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

type Props = {
  open: boolean
  onClose: () => void
  onCompleted?: () => void
  /** Fired when a non-terminal job is running (including after refresh resume). */
  onActiveChange?: (active: boolean) => void
}

type Phase = 'form' | 'queued' | 'running' | 'tac' | 'captcha' | 'done' | 'failed'

type StatusResponse = {
  ok?: boolean
  pg_code?: string
  status?: PgSyncServiceStatus
  active_job_id?: string | null
  active_job?: PgSyncJobView | null
  error?: string
}

function phaseFromStatus(status: PgSyncJobStatus): Phase {
  switch (status) {
    case 'queued':
      return 'queued'
    case 'awaiting_tac':
      return 'tac'
    case 'awaiting_captcha':
      return 'captcha'
    case 'completed':
      return 'done'
    case 'failed':
    case 'cancelled':
      return 'failed'
    default:
      return 'running'
  }
}

function statusHeadline(status: PgSyncJobStatus, queuePosition?: number | null): string {
  if (status === 'queued') {
    if (queuePosition != null && queuePosition > 1) {
      return `You are in line (position ${queuePosition})`
    }
    return 'You are in line'
  }
  if (status === 'awaiting_tac') return 'Enter SMS TAC code'
  if (status === 'awaiting_captcha') return 'Complete CAPTCHA in PG Mall'
  if (status === 'syncing') return 'Syncing customers…'
  if (status === 'running') return 'Connecting to PG Business Center…'
  if (status === 'completed') return 'Sync completed'
  if (status === 'failed') return 'Sync failed'
  if (status === 'cancelled') return 'Sync cancelled'
  return 'Sync in progress'
}

function isTerminalStatus(status: PgSyncJobStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'cancelled'
}

function useMobileSheetViewport(): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)')
    const update = () => setMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return mobile
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
        />
      </svg>
    )
  }
  return (
    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
      />
    </svg>
  )
}

function PasswordField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div>
      <label htmlFor={props.id} className="block text-sm font-medium text-slate-700 mb-1.5">
        {props.label}
      </label>
      <div className="relative">
        <input
          id={props.id}
          type={visible ? 'text' : 'password'}
          autoComplete="current-password"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 pr-11 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          placeholder={props.placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          <EyeIcon open={visible} />
        </button>
      </div>
    </div>
  )
}

export function PgBusinessCenterSyncModal({ open, onClose, onCompleted, onActiveChange }: Props) {
  const [pgCode, setPgCode] = useState('')
  const [pgPassword, setPgPassword] = useState('')
  const [crmpgPassword, setCrmpgPassword] = useState('')
  const [serviceStatus, setServiceStatus] = useState<PgSyncServiceStatus | null>(null)
  const [job, setJob] = useState<PgSyncJobView | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>('form')
  const [tac, setTac] = useState('')
  const [loading, setLoading] = useState(false)
  const [submittingTac, setSubmittingTac] = useState(false)
  const [submittingCaptcha, setSubmittingCaptcha] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const completedRef = useRef(false)
  const onActiveChangeRef = useRef(onActiveChange)
  onActiveChangeRef.current = onActiveChange

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshStatus = useCallback(async (): Promise<StatusResponse> => {
    const res = await fetch('/api/pg-sync/status', { cache: 'no-store' })
    const json = (await res.json()) as StatusResponse
    if (!res.ok) {
      throw new Error(json.error || 'Unable to check sync service status')
    }
    setPgCode(json.pg_code ?? '')
    setServiceStatus(json.status ?? null)
    return json
  }, [])

  const applyJob = useCallback(
    (next: PgSyncJobView, code: string) => {
      setJob(next)
      setJobId(next.id)
      setPhase(phaseFromStatus(next.status))
      writeStoredPgSyncJob(next.id, code)

      if (isTerminalStatus(next.status)) {
        onActiveChangeRef.current?.(false)
        clearStoredPgSyncJob()
        stopPolling()
        if (next.status === 'completed' && !completedRef.current) {
          completedRef.current = true
          onCompleted?.()
        }
      } else {
        onActiveChangeRef.current?.(true)
      }
    },
    [onCompleted, stopPolling]
  )

  const pollJob = useCallback(
    async (id: string, code: string) => {
      const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' })
      const json = (await res.json()) as { ok?: boolean; job?: PgSyncJobView; error?: string }
      if (!res.ok || !json.job) {
        if (res.status === 404) clearStoredPgSyncJob()
        throw new Error(json.error || 'Unable to fetch sync progress')
      }
      applyJob(json.job, code)
    },
    [applyJob]
  )

  const startPolling = useCallback(
    (id: string, code: string) => {
      stopPolling()
      void pollJob(id, code)
      pollRef.current = setInterval(() => {
        void pollJob(id, code).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : 'Sync poll failed')
        })
      }, 2000)
    },
    [pollJob, stopPolling]
  )

  const resumeActiveJob = useCallback(
    async (statusJson: StatusResponse) => {
      const code = statusJson.pg_code ?? ''
      let resumeId = statusJson.active_job_id ?? null

      if (!resumeId) {
        const stored = readStoredPgSyncJob()
        if (stored && stored.pgCode.toUpperCase() === code.toUpperCase()) {
          resumeId = stored.jobId
        }
      }

      if (!resumeId) return false

      const nextJob = statusJson.active_job ?? null
      if (nextJob) {
        applyJob(nextJob, code)
        if (!isTerminalStatus(nextJob.status)) {
          startPolling(resumeId, code)
        }
        return true
      }

      try {
        const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(resumeId)}`, {
          cache: 'no-store',
        })
        const json = (await res.json()) as { ok?: boolean; job?: PgSyncJobView; error?: string }
        if (!res.ok || !json.job) {
          clearStoredPgSyncJob()
          return false
        }
        applyJob(json.job, code)
        if (!isTerminalStatus(json.job.status)) {
          startPolling(resumeId, code)
        }
        return true
      } catch {
        clearStoredPgSyncJob()
        return false
      }
    },
    [applyJob, startPolling]
  )

  useEffect(() => {
    if (!open) {
      stopPolling()
      return
    }

    setLoading(true)
    setError(null)
    completedRef.current = false

    refreshStatus()
      .then(async (json) => {
        const resumed = await resumeActiveJob(json)
        if (!resumed) {
          setPhase('form')
          setJob(null)
          setJobId(null)
        }
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Failed to load sync status')
      })
      .finally(() => setLoading(false))

    return () => stopPolling()
  }, [open, refreshStatus, resumeActiveJob, stopPolling])

  const handleStart = async () => {
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/pg-sync/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pg_password: pgPassword,
          crmpg_password: crmpgPassword,
        }),
      })
      const json = (await res.json()) as {
        ok?: boolean
        job?: { job_id: string; status: PgSyncJobStatus; queue_position: number; message: string }
        pg_code?: string
        error?: string
      }
      if (!res.ok || !json.job?.job_id) {
        throw new Error(json.error || 'Failed to start sync')
      }

      const code = json.pg_code ?? pgCode
      writeStoredPgSyncJob(json.job.job_id, code)
      onActiveChangeRef.current?.(true)
      setJobId(json.job.job_id)
      setPhase(json.job.status === 'queued' ? 'queued' : 'running')
      startPolling(json.job.job_id, code)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start sync')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitTac = async () => {
    if (!jobId || !tac.trim()) return
    setSubmittingTac(true)
    setError(null)
    try {
      const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(jobId)}/tac`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tac: tac.trim() }),
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error || 'TAC rejected')
      setTac('')
      await pollJob(jobId, pgCode)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to submit TAC')
    } finally {
      setSubmittingTac(false)
    }
  }

  const handleCaptchaDone = async () => {
    if (!jobId) return
    setSubmittingCaptcha(true)
    setError(null)
    try {
      const res = await fetch(`/api/pg-sync/jobs/${encodeURIComponent(jobId)}/captcha-done`, {
        method: 'POST',
      })
      const json = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) throw new Error(json.error || 'Could not confirm CAPTCHA')
      await pollJob(jobId, pgCode)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to confirm CAPTCHA')
    } finally {
      setSubmittingCaptcha(false)
    }
  }

  const handleClose = () => {
    stopPolling()
    onClose()
  }

  const progress = job?.sync_progress
  const pct = Math.min(100, Math.max(0, Number(progress?.pct ?? 0)))
  const queuePosition = job?.queue_position ?? null
  const busyOther =
    serviceStatus?.busy &&
    serviceStatus.current_pg_code?.toUpperCase() !== pgCode.toUpperCase()

  const canStart = Boolean(pgCode && pgPassword && crmpgPassword && !jobId)
  const showProgress = phase !== 'form' && (job || loading)
  const isMobileSheet = useMobileSheetViewport()

  const sheetTransition = isMobileSheet
    ? { type: 'tween' as const, duration: 0.34, ease: [0.32, 0.72, 0, 1] as const }
    : { type: 'spring' as const, stiffness: 420, damping: 32 }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-[1100] flex items-end justify-center sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pg-sync-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={handleClose}
          />
          <motion.div
            className="relative w-full max-w-lg overflow-hidden rounded-t-2xl bg-white shadow-2xl ring-1 ring-slate-200 sm:rounded-2xl pb-[env(safe-area-inset-bottom,0px)]"
            initial={isMobileSheet ? { y: '100%' } : { opacity: 0, y: 24, scale: 0.98 }}
            animate={isMobileSheet ? { y: 0 } : { opacity: 1, y: 0, scale: 1 }}
            exit={isMobileSheet ? { y: '100%' } : { opacity: 0, y: 16, scale: 0.98 }}
            transition={sheetTransition}
          >
            {isMobileSheet ? (
              <div className="flex justify-center pt-2 pb-1" aria-hidden>
                <span className="h-1 w-10 rounded-full bg-slate-300" />
              </div>
            ) : null}
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 id="pg-sync-title" className="text-lg font-semibold text-slate-900">
                Sync from PG Business Center
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Import customers from PGMall into CRMPG. Passwords are not saved.
              </p>
            </div>

            <div className="max-h-[min(70vh,520px)] overflow-y-auto px-5 py-4 space-y-4">
              {loading && phase === 'form' && !job ? (
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <svg className="h-4 w-4 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Checking for an active sync…
                </div>
              ) : null}

              {busyOther && phase === 'form' ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <p className="font-medium">Another dealer is syncing now</p>
                  <p className="mt-1 text-amber-800/90">
                    You can start your sync — you will join the queue. We will notify you when it is
                    your turn.
                  </p>
                  {serviceStatus?.current_pg_code ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Currently running: {serviceStatus.current_pg_code}
                      {serviceStatus.queue_length > 0
                        ? ` · ${serviceStatus.queue_length} in queue`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ) : null}

              {phase === 'form' && !job ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">PG code</label>
                    <input
                      type="text"
                      readOnly
                      value={pgCode}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700"
                    />
                    <p className="mt-1 text-xs text-slate-500">From your Profile settings</p>
                  </div>
                  <PasswordField
                    id="pg-sync-pg-password"
                    label="PG Mall password"
                    value={pgPassword}
                    onChange={setPgPassword}
                    placeholder="Business Center login password"
                  />
                  <PasswordField
                    id="pg-sync-crmpg-password"
                    label="CRMPG password"
                    value={crmpgPassword}
                    onChange={setCrmpgPassword}
                    placeholder="Your CRMPG account password"
                  />
                </>
              ) : null}

              {showProgress && job ? (
                <div className="space-y-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">
                      {statusHeadline(job.status, queuePosition)}
                    </p>
                    {phase === 'queued' ? (
                      <p className="mt-2 text-sm text-slate-600">
                        You are in line — we will update this screen when your queue is up. You can
                        refresh the page; progress will resume here.
                      </p>
                    ) : null}
                    {job.last_goal ? (
                      <p className="mt-2 text-xs text-slate-500 truncate">{job.last_goal}</p>
                    ) : null}
                  </div>

                  {(phase === 'running' || phase === 'queued' || job.status === 'syncing') &&
                  progress?.total_rows ? (
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <span>
                          {progress.current_row ?? 0} / {progress.total_rows} rows
                        </span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <div className="h-2.5 w-full rounded-full bg-slate-200 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full bg-indigo-600"
                          initial={{ width: 0 }}
                          animate={{ width: `${pct}%` }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
                        <span>Inserted: {progress.inserted ?? 0}</span>
                        <span>Updated: {progress.updated ?? 0}</span>
                        <span>Failed: {progress.failed ?? 0}</span>
                      </div>
                      {progress.row_name ? (
                        <p className="mt-2 text-xs text-slate-500 truncate">
                          {progress.row_name}
                          {progress.row_pg_code ? ` · ${progress.row_pg_code}` : ''}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {phase === 'tac' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Enter the SMS TAC sent to your registered phone for PG Mall login.
                      </p>
                      <input
                        type="text"
                        inputMode="numeric"
                        maxLength={12}
                        value={tac}
                        onChange={(e) => setTac(e.target.value.replace(/\D/g, ''))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-lg tracking-widest text-center font-mono focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                        placeholder="123456"
                      />
                      <button
                        type="button"
                        disabled={!tac.trim() || submittingTac}
                        onClick={() => void handleSubmitTac()}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submittingTac ? 'Submitting…' : 'Submit TAC'}
                      </button>
                    </div>
                  ) : null}

                  {phase === 'captcha' ? (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">
                        Complete the CAPTCHA in the PG Mall session, then confirm below.
                      </p>
                      <button
                        type="button"
                        disabled={submittingCaptcha}
                        onClick={() => void handleCaptchaDone()}
                        className="w-full rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        {submittingCaptcha ? 'Confirming…' : 'I solved the CAPTCHA'}
                      </button>
                    </div>
                  ) : null}

                  {phase === 'done' ? (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                      <p className="font-medium">Customers synced successfully.</p>
                      {progress ? (
                        <p className="mt-1">
                          Inserted {progress.inserted ?? 0}, updated {progress.updated ?? 0}, failed{' '}
                          {progress.failed ?? 0}.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {phase === 'failed' ? (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                      <p className="font-medium">{job.error || 'The sync job did not complete.'}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {phase === 'done' || phase === 'failed' ? 'Close' : jobId ? 'Run in background' : 'Cancel'}
              </button>
              {phase === 'form' && !job ? (
                <button
                  type="button"
                  disabled={!canStart || loading}
                  onClick={() => void handleStart()}
                  className="flex-1 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {loading ? 'Starting…' : 'Start sync'}
                </button>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

/** Call on customers page mount to detect an in-flight worker job. */
export async function fetchPgSyncActiveJobId(): Promise<string | null> {
  try {
    const res = await fetch('/api/pg-sync/status', { cache: 'no-store' })
    const json = (await res.json()) as StatusResponse
    if (!res.ok) return null
    if (json.active_job_id) return json.active_job_id
    const stored = readStoredPgSyncJob()
    if (stored && stored.pgCode.toUpperCase() === (json.pg_code ?? '').toUpperCase()) {
      return stored.jobId
    }
    return null
  } catch {
    return null
  }
}
