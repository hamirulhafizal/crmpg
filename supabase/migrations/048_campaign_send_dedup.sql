-- Prevent duplicate campaign step sends from overlapping cron workers.
-- Also adds a global advisory lock RPC and fixes campaign processor pg_cron frequency.

-- Keep the earliest successful/in-flight log per enrollment step; mark later duplicates failed.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY enrollment_id, campaign_step_id
      ORDER BY
        CASE send_status WHEN 'sent' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
        sent_at NULLS LAST,
        created_at ASC
    ) AS rn
  FROM public.campaign_message_logs
  WHERE send_status IN ('pending', 'sent')
    AND enrollment_id IS NOT NULL
    AND campaign_step_id IS NOT NULL
)
UPDATE public.campaign_message_logs AS cml
SET
  send_status = 'failed',
  error_message = 'Duplicate log deduped before unique index (migration 048)'
FROM ranked
WHERE cml.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_campaign_message_logs_enrollment_step_active
  ON public.campaign_message_logs (enrollment_id, campaign_step_id)
  WHERE send_status IN ('pending', 'sent')
    AND enrollment_id IS NOT NULL
    AND campaign_step_id IS NOT NULL;

COMMENT ON INDEX public.idx_campaign_message_logs_enrollment_step_active IS
  'One in-flight or completed send per enrollment step (dedupes overlapping cron runs).';

CREATE OR REPLACE FUNCTION public.try_campaign_processor_lock()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_lock(hashtext('crmpg_campaign_processor_v1'));
END;
$$;

CREATE OR REPLACE FUNCTION public.release_campaign_processor_lock()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_unlock(hashtext('crmpg_campaign_processor_v1'));
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_campaign_processor_lock() TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_processor_lock() TO service_role;

-- Reschedule campaign processor from every minute to every 5 minutes when job exists.
DO $$
DECLARE
  job_row record;
BEGIN
  SELECT jobid, command INTO job_row
  FROM cron.job
  WHERE jobname = 'campaign-processor-every-5-min'
  LIMIT 1;

  IF job_row.jobid IS NOT NULL THEN
    PERFORM cron.unschedule('campaign-processor-every-5-min');
    PERFORM cron.schedule(
      'campaign-processor-every-5-min',
      '*/5 * * * *',
      job_row.command
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
END;
$$;
