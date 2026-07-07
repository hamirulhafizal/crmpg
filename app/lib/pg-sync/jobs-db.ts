import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { isPgSyncJobActive } from '@/app/lib/pg-sync/active-job'
import type { PgSyncJobStatus, PgSyncJobView, PgSyncProgress } from '@/app/lib/pg-sync/types'
import type { SupabaseClient } from '@supabase/supabase-js'

export type PgSyncJobRecord = {
  id: string
  user_id: string
  pg_code: string
  worker_job_id: string
  status: PgSyncJobStatus
  queue_position: number | null
  progress: PgSyncProgress
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

const TERMINAL: PgSyncJobStatus[] = ['completed', 'failed', 'cancelled']

const ACTIVE_STATUSES: PgSyncJobStatus[] = [
  'queued',
  'running',
  'awaiting_tac',
  'awaiting_captcha',
  'syncing',
]

const VALID_STATUSES = new Set<PgSyncJobStatus>([
  'queued',
  'running',
  'awaiting_tac',
  'awaiting_captcha',
  'syncing',
  'completed',
  'failed',
  'cancelled',
])

export type PgSyncWebhookPayload = {
  event?: string
  job_id?: string
  timestamp?: string
  pg_code?: string
  status?: string
  sync_progress?: PgSyncProgress | Record<string, unknown> | null
  error?: string | null
  message?: string | null
}

function normalizePg(code: string): string {
  return code.trim().toUpperCase()
}

function isTerminal(status: PgSyncJobStatus): boolean {
  return TERMINAL.includes(status)
}

function parseStatus(value: string | undefined | null): PgSyncJobStatus | null {
  if (!value) return null
  const s = value.trim() as PgSyncJobStatus
  return VALID_STATUSES.has(s) ? s : null
}

function statusFromWebhook(event: string, status?: string | null): PgSyncJobStatus | null {
  const parsed = parseStatus(status)
  if (parsed) return parsed

  const map: Record<string, PgSyncJobStatus> = {
    'job.queued': 'queued',
    'job.started': 'running',
    'step.completed': 'running',
    'job.awaiting_tac': 'awaiting_tac',
    'job.awaiting_captcha': 'awaiting_captcha',
    'sync.progress': 'syncing',
    'job.completed': 'completed',
    'job.failed': 'failed',
    'job.cancelled': 'cancelled',
  }
  return map[event] ?? null
}

function rowFromDb(raw: Record<string, unknown>): PgSyncJobRecord {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    pg_code: String(raw.pg_code),
    worker_job_id: String(raw.worker_job_id),
    status: parseStatus(String(raw.status)) ?? 'failed',
    queue_position:
      raw.queue_position == null ? null : Number(raw.queue_position),
    progress: (raw.progress as PgSyncProgress) ?? {},
    error_message: raw.error_message != null ? String(raw.error_message) : null,
    started_at: raw.started_at != null ? String(raw.started_at) : null,
    completed_at: raw.completed_at != null ? String(raw.completed_at) : null,
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  }
}

export async function supersedeActivePgSyncJobs(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  const now = new Date().toISOString()
  await supabase
    .from('pg_sync_jobs')
    .update({
      status: 'cancelled',
      completed_at: now,
      error_message: 'Superseded by a new sync request',
    })
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
}

export async function insertPgSyncJob(
  supabase: SupabaseClient,
  params: {
    userId: string
    pgCode: string
    workerJobId: string
    status: PgSyncJobStatus
    queuePosition?: number | null
  }
): Promise<PgSyncJobRecord | null> {
  await supersedeActivePgSyncJobs(supabase, params.userId)

  const { data, error } = await supabase
    .from('pg_sync_jobs')
    .insert({
      user_id: params.userId,
      pg_code: normalizePg(params.pgCode),
      worker_job_id: params.workerJobId,
      status: params.status,
      queue_position: params.queuePosition ?? null,
      progress: {},
    })
    .select('*')
    .single()

  if (error || !data) return null
  return rowFromDb(data as Record<string, unknown>)
}

export async function getActivePgSyncJobForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<PgSyncJobRecord | null> {
  const { data, error } = await supabase
    .from('pg_sync_jobs')
    .select('*')
    .eq('user_id', userId)
    .in('status', ACTIVE_STATUSES)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) return null
  return rowFromDb(data as Record<string, unknown>)
}

export async function getPgSyncJobByWorkerId(
  workerJobId: string
): Promise<PgSyncJobRecord | null> {
  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('pg_sync_jobs')
    .select('*')
    .eq('worker_job_id', workerJobId)
    .maybeSingle()

  if (error || !data) return null
  return rowFromDb(data as Record<string, unknown>)
}

async function resolveUserIdByPgCode(pgCode: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  const want = normalizePg(pgCode)
  const { data, error } = await admin
    .from('profiles')
    .select('id, pgcode')
    .not('pgcode', 'is', null)

  if (error || !data?.length) return null

  const match = data.find((row) => normalizePg(String(row.pgcode ?? '')) === want)
  return match?.id ?? null
}

export function buildPgSyncJobPatchFromView(job: PgSyncJobView): {
  status: PgSyncJobStatus
  queue_position: number | null
  progress: PgSyncProgress
  error_message: string | null
  started_at?: string | null
  completed_at?: string | null
} {
  const patch = {
    status: job.status,
    queue_position: job.queue_position ?? null,
    progress: job.sync_progress ?? {},
    error_message: job.error ?? null,
  }

  if (job.started_at && !isTerminal(job.status)) {
    return { ...patch, started_at: job.started_at }
  }

  if (isTerminal(job.status)) {
    return {
      ...patch,
      started_at: job.started_at ?? null,
      completed_at: job.finished_at ?? new Date().toISOString(),
    }
  }

  return patch
}

export async function syncPgSyncJobFromView(
  userId: string,
  job: PgSyncJobView
): Promise<void> {
  const admin = createServiceRoleClient()
  const patch = buildPgSyncJobPatchFromView(job)

  const { data: existing } = await admin
    .from('pg_sync_jobs')
    .select('id, user_id, started_at')
    .eq('worker_job_id', job.id)
    .maybeSingle()

  if (existing) {
    await admin
      .from('pg_sync_jobs')
      .update({
        ...patch,
        pg_code: normalizePg(job.pg_code),
        started_at: patch.started_at ?? existing.started_at ?? job.started_at ?? null,
      })
      .eq('id', existing.id)
    return
  }

  const resolvedUserId = userId || (await resolveUserIdByPgCode(job.pg_code))

  if (!resolvedUserId) return

  await supersedeActivePgSyncJobs(admin, resolvedUserId)

  await admin.from('pg_sync_jobs').insert({
    user_id: resolvedUserId,
    pg_code: normalizePg(job.pg_code),
    worker_job_id: job.id,
    status: patch.status,
    queue_position: patch.queue_position,
    progress: patch.progress,
    error_message: patch.error_message,
    started_at: patch.started_at ?? job.started_at ?? null,
    completed_at: patch.completed_at ?? null,
  })
}

export async function applyPgSyncWebhook(payload: PgSyncWebhookPayload): Promise<boolean> {
  const workerJobId = payload.job_id?.trim()
  const event = payload.event?.trim() ?? 'unknown'
  if (!workerJobId) return false

  const nextStatus = statusFromWebhook(event, payload.status)
  const admin = createServiceRoleClient()

  let row = await getPgSyncJobByWorkerId(workerJobId)

  if (!row && payload.pg_code) {
    const userId = await resolveUserIdByPgCode(payload.pg_code)
    if (userId) {
      await supersedeActivePgSyncJobs(admin, userId)
      const { data } = await admin
        .from('pg_sync_jobs')
        .insert({
          user_id: userId,
          pg_code: normalizePg(payload.pg_code),
          worker_job_id: workerJobId,
          status: nextStatus ?? 'queued',
          progress: (payload.sync_progress as PgSyncProgress) ?? {},
        })
        .select('*')
        .single()
      if (data) row = rowFromDb(data as Record<string, unknown>)
    }
  }

  if (!row) return false

  const patch: Record<string, unknown> = {}

  if (nextStatus) patch.status = nextStatus
  if (payload.pg_code) patch.pg_code = normalizePg(payload.pg_code)
  if (payload.sync_progress && typeof payload.sync_progress === 'object') {
    patch.progress = payload.sync_progress
  }
  if (payload.error) patch.error_message = payload.error
  else if (payload.message && (nextStatus === 'failed' || event === 'job.failed')) {
    patch.error_message = payload.message
  }

  if (event === 'job.started' && !row.started_at) {
    patch.started_at = payload.timestamp ?? new Date().toISOString()
  }

  if (nextStatus && isTerminal(nextStatus)) {
    patch.completed_at = payload.timestamp ?? new Date().toISOString()
  }

  const { error } = await admin.from('pg_sync_jobs').update(patch).eq('id', row.id)
  return !error
}

export async function markPgSyncJobCancelled(
  userId: string,
  workerJobId: string
): Promise<void> {
  const admin = createServiceRoleClient()
  await admin
    .from('pg_sync_jobs')
    .update({
      status: 'cancelled',
      completed_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('worker_job_id', workerJobId)
}

export function resolveActiveJobId(
  workerStatusActiveId: string | null,
  dbJob: PgSyncJobRecord | null
): string | null {
  if (workerStatusActiveId) return workerStatusActiveId
  if (dbJob && isPgSyncJobActive(dbJob.status)) return dbJob.worker_job_id
  return null
}
