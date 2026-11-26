-- Durable paste-link import jobs (survive PWA close / serverless reconnect).

CREATE TABLE IF NOT EXISTS public.social_link_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source_url TEXT NOT NULL,
  platform TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress_label TEXT,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  asset_id UUID REFERENCES public.admin_media_assets (id) ON DELETE SET NULL,
  caption TEXT,
  caption_source TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_link_import_jobs_status_check CHECK (
    status IN ('queued', 'running', 'completed', 'failed', 'cancelled')
  ),
  CONSTRAINT social_link_import_jobs_progress_pct_check CHECK (
    progress_pct >= 0 AND progress_pct <= 100
  )
);

CREATE INDEX IF NOT EXISTS idx_social_link_import_jobs_user_created
  ON public.social_link_import_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_link_import_jobs_claim
  ON public.social_link_import_jobs (status, lease_expires_at);

-- One active (non-terminal) paste-link job per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_link_import_jobs_user_active
  ON public.social_link_import_jobs (user_id)
  WHERE status IN ('queued', 'running');

COMMENT ON TABLE public.social_link_import_jobs IS
  'Background paste-link video imports for social scheduling. Processing continues after the PWA closes.';

CREATE OR REPLACE FUNCTION public.touch_social_link_import_job_updated_at ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_social_link_import_jobs_updated ON public.social_link_import_jobs;
CREATE TRIGGER trg_social_link_import_jobs_updated
  BEFORE UPDATE ON public.social_link_import_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_social_link_import_job_updated_at ();

ALTER TABLE public.social_link_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_social_link_import_jobs"
  ON public.social_link_import_jobs FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

CREATE POLICY "users_insert_own_social_link_import_jobs"
  ON public.social_link_import_jobs FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "users_update_own_social_link_import_jobs"
  ON public.social_link_import_jobs FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

GRANT SELECT, INSERT, UPDATE ON public.social_link_import_jobs TO authenticated;
GRANT ALL ON public.social_link_import_jobs TO service_role;
