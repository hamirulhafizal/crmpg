import type { PgSyncJobStatus, PgSyncServiceStatus } from '@/app/lib/pg-sync/types'

const TERMINAL: PgSyncJobStatus[] = ['completed', 'failed', 'cancelled']

export function isPgSyncJobActive(status: PgSyncJobStatus): boolean {
  return !TERMINAL.includes(status)
}

export function resolveActiveJobIdForPgCode(
  status: PgSyncServiceStatus,
  pgCode: string
): string | null {
  const want = pgCode.trim().toUpperCase()

  if (status.current_pg_code?.trim().toUpperCase() === want && status.current_job_id) {
    return status.current_job_id
  }

  const queued = status.queue.find((q) => q.pg_code.trim().toUpperCase() === want)
  if (queued?.job_id && isPgSyncJobActive(queued.status)) {
    return queued.job_id
  }

  return null
}

export function isJobListedOnWorker(
  status: PgSyncServiceStatus,
  workerJobId: string
): boolean {
  if (status.current_job_id === workerJobId) return true
  return status.queue.some((q) => q.job_id === workerJobId)
}

export const PG_SYNC_JOB_STORAGE_KEY = 'crmpg_pg_sync_active_job'

export type StoredPgSyncJob = {
  jobId: string
  pgCode: string
  savedAt: number
}

export function readStoredPgSyncJob(): StoredPgSyncJob | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PG_SYNC_JOB_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredPgSyncJob
    if (!parsed?.jobId || !parsed?.pgCode) return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredPgSyncJob(jobId: string, pgCode: string): void {
  if (typeof window === 'undefined') return
  const payload: StoredPgSyncJob = { jobId, pgCode, savedAt: Date.now() }
  sessionStorage.setItem(PG_SYNC_JOB_STORAGE_KEY, JSON.stringify(payload))
}

export function clearStoredPgSyncJob(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(PG_SYNC_JOB_STORAGE_KEY)
}
