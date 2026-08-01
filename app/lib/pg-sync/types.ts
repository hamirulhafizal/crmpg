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
  tac_filled?: boolean
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
  /** True after dealer POSTs TAC — worker may still be typing/verifying on PGMall. */
  tac_filled?: boolean
  pg_code: string
  queue_position?: number | null
  step?: number
  max_steps?: number
  url?: string
  last_goal?: string
  last_action?: string
  /** Browser Use Cloud / noVNC URL to watch automation live. */
  browser_live_url?: string | null
  /** Latest viewport snapshot (`data:image/...;base64,...`). */
  screenshot_base64?: string | null
  sync_progress?: PgSyncProgress
  log?: PgSyncLogEntry[]
  final?: string | null
  error?: string | null
  created_at?: string
  started_at?: string | null
  finished_at?: string | null
}

export type PgSyncWebhookEvent = {
  event: string
  job_id: string
  timestamp: string
  pg_code?: string
  status?: string
  step?: number
  max_steps?: number
  url?: string
  last_goal?: string
  last_action?: string
  browser_live_url?: string | null
  screenshot_base64?: string | null
  sync_progress?: PgSyncProgress | Record<string, unknown> | null
  final?: string | null
  error?: string | null
  message?: string | null
  tac_filled?: boolean
}

export type PgSyncJobEventsView = {
  job_id: string
  events: PgSyncWebhookEvent[]
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
