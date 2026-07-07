import type { PgSyncJobStatus, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

/** Typical full sync duration used for wait estimates (minutes). */
export const PG_SYNC_AVG_JOB_MINUTES = 12

export type PgSyncQueueReadiness =
  | 'ready'
  | 'worker_busy'
  | 'my_queued'
  | 'my_running'
  | 'my_tac'
  | 'my_captcha'
  | 'my_syncing'

export type PgSyncQueueInfo = {
  readiness: PgSyncQueueReadiness
  worker_busy: boolean
  current_pg_code: string | null
  global_queue_count: number
  /** 1-based queue position for this dealer's job, if queued. */
  my_queue_position: number | null
  /** How many jobs run before this dealer's turn. */
  positions_ahead: number
  estimated_wait_min: number | null
  estimated_wait_max: number | null
  badge_label: string
  form_hint: string
}

function normalizePg(code: string | null | undefined): string {
  return (code ?? '').trim().toUpperCase()
}

function waitRange(positionsAhead: number, avgMinutes = PG_SYNC_AVG_JOB_MINUTES): {
  min: number
  max: number
} {
  if (positionsAhead <= 0) return { min: 0, max: 0 }
  const min = Math.max(1, Math.round(positionsAhead * avgMinutes * 0.75))
  const max = Math.max(min + 2, Math.round(positionsAhead * avgMinutes * 1.25))
  return { min, max }
}

function formatWait(min: number, max: number): string {
  if (min <= 0 && max <= 0) return 'starts immediately'
  if (min === max) return `about ${min} min`
  return `about ${min}–${max} min`
}

export function buildQueueInfo(params: {
  status: PgSyncServiceStatus
  myPgCode: string
  myQueuePosition?: number | null
  myJobStatus?: PgSyncJobStatus | null
}): PgSyncQueueInfo {
  const myPg = normalizePg(params.myPgCode)
  const currentPg = normalizePg(params.status.current_pg_code)
  const globalQueue = params.status.queue_length ?? params.status.queue?.length ?? 0
  const myEntry = params.status.queue.find((q) => normalizePg(q.pg_code) === myPg)
  const myQueuePosition = params.myQueuePosition ?? myEntry?.position ?? null
  const myJobStatus = params.myJobStatus ?? myEntry?.status ?? null
  const workerBusy = Boolean(params.status.busy)
  const isMyTurn = workerBusy && currentPg === myPg

  if (myJobStatus === 'awaiting_tac') {
    return {
      readiness: 'my_tac',
      worker_busy: workerBusy,
      current_pg_code: params.status.current_pg_code ?? null,
      global_queue_count: globalQueue,
      my_queue_position: myQueuePosition,
      positions_ahead: 0,
      estimated_wait_min: 0,
      estimated_wait_max: 0,
      badge_label: 'Enter TAC',
      form_hint: 'SMS TAC required — open sync to continue.',
    }
  }

  if (myJobStatus === 'awaiting_captcha') {
    return {
      readiness: 'my_captcha',
      worker_busy: workerBusy,
      current_pg_code: params.status.current_pg_code ?? null,
      global_queue_count: globalQueue,
      my_queue_position: myQueuePosition,
      positions_ahead: 0,
      estimated_wait_min: 0,
      estimated_wait_max: 0,
      badge_label: 'CAPTCHA',
      form_hint: 'Complete CAPTCHA in PG Mall to continue.',
    }
  }

  if (
    isMyTurn &&
    myJobStatus &&
    ['running', 'syncing'].includes(myJobStatus)
  ) {
    return {
      readiness: myJobStatus === 'syncing' ? 'my_syncing' : 'my_running',
      worker_busy: workerBusy,
      current_pg_code: params.status.current_pg_code ?? null,
      global_queue_count: globalQueue,
      my_queue_position: myQueuePosition,
      positions_ahead: 0,
      estimated_wait_min: 0,
      estimated_wait_max: 0,
      badge_label: 'Syncing…',
      form_hint: 'Your sync is running now.',
    }
  }

  if (myJobStatus === 'queued' || (myQueuePosition != null && myQueuePosition > 0)) {
    const pos = myQueuePosition ?? 1
    const ahead = Math.max(0, pos - 1)
    const { min, max } = waitRange(ahead + (workerBusy && !isMyTurn ? 1 : 0))
    return {
      readiness: 'my_queued',
      worker_busy: workerBusy,
      current_pg_code: params.status.current_pg_code ?? null,
      global_queue_count: globalQueue,
      my_queue_position: pos,
      positions_ahead: ahead,
      estimated_wait_min: min,
      estimated_wait_max: max,
      badge_label: ahead > 0 ? `#${pos} in line` : 'Your turn soon',
      form_hint: `You are #${pos} in line · ${formatWait(min, max)} until your sync starts.`,
    }
  }

  if (!workerBusy) {
    return {
      readiness: 'ready',
      worker_busy: false,
      current_pg_code: null,
      global_queue_count: globalQueue,
      my_queue_position: null,
      positions_ahead: 0,
      estimated_wait_min: 0,
      estimated_wait_max: 0,
      badge_label: 'Ready',
      form_hint: 'Worker is free — your sync starts immediately.',
    }
  }

  const ahead = globalQueue + (workerBusy ? 1 : 0)
  const { min, max } = waitRange(ahead)
  const runningLabel = params.status.current_pg_code
    ? `${params.status.current_pg_code} syncing`
    : 'Another dealer syncing'

  return {
    readiness: 'worker_busy',
    worker_busy: true,
    current_pg_code: params.status.current_pg_code ?? null,
    global_queue_count: globalQueue,
    my_queue_position: null,
    positions_ahead: ahead,
    estimated_wait_min: min,
    estimated_wait_max: max,
    badge_label: ahead > 0 ? `${ahead} ahead` : 'Busy',
    form_hint: `${runningLabel}${globalQueue > 0 ? ` · ${globalQueue} queued` : ''} · ${formatWait(min, max)} if you join now.`,
  }
}
