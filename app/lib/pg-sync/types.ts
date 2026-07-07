export type PgSyncJobStatus =
  | 'queued'
  | 'running'
  | 'awaiting_tac'
  | 'awaiting_captcha'
  | 'syncing'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type PgSyncProgress = {
  active?: boolean
  filter_label?: string
  phase?: string
  pct?: number
  message?: string
  current_row?: number
  total_rows?: number
  inserted?: number
  updated?: number
  failed?: number
  row_name?: string
  row_pg_code?: string
}

export type PgSyncLogEntry = {
  step: number
  url?: string
  goal?: string
  action?: string
  error?: boolean
}

export type PgSyncJobView = {
  id: string
  status: PgSyncJobStatus
  pg_code: string
  queue_position?: number | null
  step?: number
  max_steps?: number
  url?: string
  last_goal?: string
  last_action?: string
  sync_progress?: PgSyncProgress
  log?: PgSyncLogEntry[]
  final?: string | null
  error?: string | null
  created_at?: string
  started_at?: string | null
  finished_at?: string | null
}

export type PgSyncServiceStatus = {
  busy: boolean
  current_job_id?: string | null
  current_pg_code?: string | null
  queue_length: number
  queue: Array<{
    job_id: string
    pg_code: string
    position: number
    status: PgSyncJobStatus
  }>
  last_job_id?: string | null
  last_job_pg_code?: string | null
  last_job_status?: PgSyncJobStatus | null
  last_job_error?: string | null
}

export type PgSyncCreateJobResponse = {
  job_id: string
  status: PgSyncJobStatus
  queue_position: number
  message: string
  webhook_url?: string | null
}
