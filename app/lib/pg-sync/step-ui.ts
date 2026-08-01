import type { PgSyncJobStatus, PgSyncJobView, PgSyncLogEntry } from '@/app/lib/pg-sync/types'

export type PgSyncUiStepId =
  | 'queue'
  | 'connect'
  | 'tac'
  | 'captcha'
  | 'sync'
  | 'complete'

export type PgSyncUiStepState = 'pending' | 'active' | 'done' | 'error' | 'skipped'

export type PgSyncUiStep = {
  id: PgSyncUiStepId
  label: string
  description: string
  state: PgSyncUiStepState
  detail?: string | null
}

export type PgSyncLiveSnapshot = {
  headline: string
  detail: string | null
  stepLabel: string | null
  updatedAt: string | null
}

const GOAL_PATTERNS: Array<{ test: RegExp; label: string }> = [
  { test: /captcha|bot.?check|pgmall_captcha/i, label: 'Checking CAPTCHA on PG Mall' },
  { test: /tac|otp|sms|verification.?code/i, label: 'Waiting for SMS verification code' },
  { test: /login|sign.?in|password|credential/i, label: 'Signing in to PG Mall' },
  { test: /navigate|open|business.?center|pgmall/i, label: 'Opening PG Business Center' },
  { test: /download|export|fetch|load.*customer|read.*row/i, label: 'Reading customer data from PG Mall' },
  { test: /insert|upsert|save|sync|write/i, label: 'Saving customers to CRMPG' },
  { test: /queue|wait|line/i, label: 'Waiting in sync queue' },
  { test: /filter|search|page/i, label: 'Loading customer list' },
]

function humanizeWorkerText(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  for (const { test, label } of GOAL_PATTERNS) {
    if (test.test(text)) return label
  }

  if (text.length > 120) {
    return text.replace(/\s+/g, ' ').slice(0, 117) + '…'
  }
  return text
}

function humanizeLogEntry(entry: PgSyncLogEntry): string {
  const fromGoal = humanizeWorkerText(entry.goal)
  if (fromGoal) return fromGoal
  const fromAction = humanizeWorkerText(entry.action)
  if (fromAction) return fromAction
  if (entry.error) return 'Step encountered an issue'
  return `Step ${entry.step}`
}

function progressDetailText(
  progress: PgSyncJobView['sync_progress'],
  status: PgSyncJobStatus
): string | null {
  const message = humanizeWorkerText(progress?.message)
  if (message) return message

  const phase = (progress?.phase ?? '').trim().toLowerCase()
  if (!phase || phase === 'idle') return null
  if (phase === 'verifying_tac') return 'Verifying SMS code with PG Mall…'
  if (status === 'syncing' || progress?.active) {
    return humanizeWorkerText(progress?.phase)
  }
  return null
}

export function buildPgSyncLiveSnapshot(job: PgSyncJobView): PgSyncLiveSnapshot {
  const progress = job.sync_progress
  const fromProgress = progressDetailText(progress, job.status)

  let headline = 'Sync in progress'
  let detail: string | null =
    fromProgress ??
    humanizeWorkerText(job.last_goal) ??
    humanizeWorkerText(job.last_action) ??
    null

  switch (job.status) {
    case 'queued':
      headline =
        job.queue_position != null && job.queue_position > 1
          ? `In queue (position ${job.queue_position})`
          : 'In queue — starting soon'
      detail = detail ?? 'Your sync will begin when the worker is free.'
      break
    case 'awaiting_tac':
      headline = job.tac_filled ? 'Verifying SMS code' : 'SMS code required'
      detail =
        detail ??
        (job.tac_filled
          ? 'Signing in to PG Mall with your code…'
          : 'Enter the TAC sent to your PG Mall registered phone.')
      break
    case 'awaiting_captcha':
      headline = 'CAPTCHA required'
      detail = detail ?? 'Complete the CAPTCHA in PG Mall, then confirm below.'
      break
    case 'syncing':
      headline = 'Importing customers'
      detail =
        detail ??
        (progress?.total_rows
          ? `Processing row ${progress.current_row ?? 0} of ${progress.total_rows}`
          : 'Writing customers into CRMPG…')
      break
    case 'running':
      headline =
        progress?.phase === 'verifying_tac'
          ? 'Verifying SMS code'
          : 'Connecting to PG Business Center'
      detail =
        detail ??
        (progress?.phase === 'verifying_tac'
          ? 'Signing in to PG Mall with your code…'
          : 'Logging in and preparing your customer export…')
      break
    case 'completed':
      headline = 'Sync completed'
      detail = job.final ?? detail ?? 'All customers have been imported.'
      break
    case 'failed':
      headline = 'Sync failed'
      detail = job.error ?? detail ?? 'The sync did not complete.'
      break
    case 'cancelled':
      headline = 'Sync cancelled'
      detail = detail ?? 'This sync was stopped.'
      break
  }

  const stepLabel =
    job.step != null && job.max_steps != null && job.max_steps > 0
      ? `Worker step ${job.step} of ${job.max_steps}`
      : null

  return {
    headline,
    detail,
    stepLabel,
    updatedAt: job.finished_at ?? null,
  }
}

function stepIndex(id: PgSyncUiStepId): number {
  const order: PgSyncUiStepId[] = ['queue', 'connect', 'tac', 'captcha', 'sync', 'complete']
  return order.indexOf(id)
}

function baseSteps(): Omit<PgSyncUiStep, 'state' | 'detail'>[] {
  return [
    {
      id: 'queue',
      label: 'Queue',
      description: 'Waiting for your turn on the sync worker',
    },
    {
      id: 'connect',
      label: 'Connect & sign in',
      description: 'Open PG Mall and authenticate your dealer account',
    },
    {
      id: 'tac',
      label: 'SMS verification',
      description: 'Enter the TAC code sent to your phone',
    },
    {
      id: 'captcha',
      label: 'CAPTCHA',
      description: 'Complete security check on PG Mall',
    },
    {
      id: 'sync',
      label: 'Import customers',
      description: 'Download from PG Mall and save to CRMPG',
    },
    {
      id: 'complete',
      label: 'Done',
      description: 'Customers are ready in your CRM',
    },
  ]
}

function activeStepId(job: PgSyncJobView): PgSyncUiStepId {
  switch (job.status) {
    case 'queued':
      return 'queue'
    case 'awaiting_tac':
      return job.tac_filled ? 'connect' : 'tac'
    case 'awaiting_captcha':
      return 'captcha'
    case 'syncing':
      return 'sync'
    case 'completed':
      return 'complete'
    case 'failed':
    case 'cancelled':
      if (job.sync_progress?.total_rows) return 'sync'
      if (needsCaptcha(job)) return 'captcha'
      if (needsTac(job)) return 'tac'
      return 'connect'
    default: {
      const hay = workerTextHaystack(job)
      if (/captcha|pgmall_captcha|bot.?check/i.test(hay) && needsCaptcha(job)) return 'captcha'
      if (/tac|otp|sms/i.test(hay) && needsTac(job)) return 'tac'
      return 'connect'
    }
  }
}

function workerTextHaystack(job: PgSyncJobView): string {
  const logText = (job.log ?? [])
    .map((e) => `${e.goal ?? ''} ${e.action ?? ''}`)
    .join(' ')
  return `${job.last_goal ?? ''} ${job.last_action ?? ''} ${logText}`
}

/** Dealer must enter TAC — not yet submitted or worker asked for a fresh code. */
export function isPgSyncTacInputRequired(job: PgSyncJobView): boolean {
  return job.status === 'awaiting_tac' && job.tac_filled !== true
}

/** TAC was submitted; worker is typing or verifying on PGMall. */
export function isPgSyncTacVerifying(job: PgSyncJobView): boolean {
  if (job.tac_filled === true) {
    return job.status === 'awaiting_tac' || job.sync_progress?.phase === 'verifying_tac'
  }
  return job.sync_progress?.phase === 'verifying_tac'
}

function needsTac(job: PgSyncJobView): boolean {
  if (job.status === 'awaiting_tac') return job.tac_filled !== true
  return /tac|otp|sms/i.test(workerTextHaystack(job))
}

function needsCaptcha(job: PgSyncJobView): boolean {
  if (job.status === 'awaiting_captcha') return true
  return /captcha|bot|pgmall_captcha/i.test(workerTextHaystack(job))
}

export function buildPgSyncUiSteps(job: PgSyncJobView): PgSyncUiStep[] {
  const includeTac = needsTac(job)
  const includeCaptcha = needsCaptcha(job)
  const activeId = activeStepId(job)
  const activeIdx = stepIndex(activeId)
  const isTerminal = job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled'
  const isError = job.status === 'failed' || job.status === 'cancelled'

  const snapshot = buildPgSyncLiveSnapshot(job)

  return baseSteps()
    .filter((s) => {
      if (s.id === 'tac' && !includeTac && job.status !== 'awaiting_tac') {
        return job.status === 'syncing' || job.status === 'completed' ? includeTac : false
      }
      if (s.id === 'captcha' && !includeCaptcha && job.status !== 'awaiting_captcha') {
        return job.status === 'syncing' || job.status === 'completed' ? includeCaptcha : false
      }
      return true
    })
    .map((s) => {
      const idx = stepIndex(s.id)
      let state: PgSyncUiStepState = 'pending'

      if (isTerminal && job.status === 'completed') {
        state = 'done'
      } else if (isError && idx === activeIdx) {
        state = 'error'
      } else if (isError && idx < activeIdx) {
        state = 'done'
      } else if (!isTerminal && idx < activeIdx) {
        state = 'done'
      } else if (!isTerminal && s.id === activeId) {
        state = 'active'
      } else if (job.status === 'completed' && s.id === 'complete') {
        state = 'done'
      }

      if (s.id === 'tac' && !includeTac && job.status !== 'awaiting_tac' && job.status !== 'syncing' && job.status !== 'completed') {
        state = 'skipped'
      }
      if (s.id === 'captcha' && !includeCaptcha && job.status !== 'awaiting_captcha' && job.status !== 'syncing' && job.status !== 'completed') {
        state = 'skipped'
      }

      const detail =
        state === 'active' && snapshot.detail
          ? snapshot.detail
          : state === 'done' && s.id === 'sync' && job.sync_progress?.total_rows
            ? `${job.sync_progress.inserted ?? 0} inserted · ${job.sync_progress.updated ?? 0} updated`
            : null

      return { ...s, state, detail }
    })
    .filter((s) => s.state !== 'skipped')
}

export function buildPgSyncActivityLog(job: PgSyncJobView, limit = 6): Array<{ key: string; label: string; error?: boolean }> {
  const entries = [...(job.log ?? [])].slice(-limit).reverse()
  return entries.map((entry, i) => ({
    key: `${entry.step}-${i}`,
    label: humanizeLogEntry(entry),
    error: Boolean(entry.error),
  }))
}
