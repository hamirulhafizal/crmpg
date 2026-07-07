-- PG Business Center sync job records (cross-browser resume + history).
-- Worker remains source of truth for live progress; this table stores durable pointers.

CREATE TABLE IF NOT EXISTS public.pg_sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  pg_code TEXT NOT NULL,
  worker_job_id TEXT NOT NULL,
  status TEXT NOT NULL,
  queue_position INTEGER,
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pg_sync_jobs_status_check CHECK (
    status IN (
      'queued',
      'running',
      'awaiting_tac',
      'awaiting_captcha',
      'syncing',
      'completed',
      'failed',
      'cancelled'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pg_sync_jobs_worker_job_id
  ON public.pg_sync_jobs (worker_job_id);

CREATE INDEX IF NOT EXISTS idx_pg_sync_jobs_user_created
  ON public.pg_sync_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pg_sync_jobs_pg_code
  ON public.pg_sync_jobs (pg_code);

-- One non-terminal job per user (new sync supersedes the previous active row).
CREATE UNIQUE INDEX IF NOT EXISTS idx_pg_sync_jobs_user_active
  ON public.pg_sync_jobs (user_id)
  WHERE status NOT IN ('completed', 'failed', 'cancelled');

COMMENT ON TABLE public.pg_sync_jobs IS
  'Durable PG Business Center sync jobs for CRMPG dealers. Passwords are never stored.';

CREATE OR REPLACE FUNCTION public.touch_pg_sync_job_updated_at ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pg_sync_jobs_updated ON public.pg_sync_jobs;
CREATE TRIGGER trg_pg_sync_jobs_updated
  BEFORE UPDATE ON public.pg_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_pg_sync_job_updated_at ();

ALTER TABLE public.pg_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "users_insert_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_update_own_pg_sync_jobs"
  ON public.pg_sync_jobs FOR UPDATE TO authenticated
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

GRANT SELECT, INSERT, UPDATE ON public.pg_sync_jobs TO authenticated;
GRANT ALL ON public.pg_sync_jobs TO service_role;
