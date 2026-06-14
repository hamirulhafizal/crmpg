-- Schedule SaaS subscription maintenance via Supabase pg_cron (replaces Vercel Cron).
-- Calls GET /api/cron/saas daily at 02:00 UTC (same schedule as previous vercel.json entry).
--
-- BEFORE applying in production, replace placeholders in the DO block below:
--   YOUR_APP_URL   e.g. https://crmpg.vercel.app
--   YOUR_CRON_SECRET  must match CRON_SECRET in Vercel env

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.invoke_saas_subscription_cron(p_app_url text, p_cron_secret text)
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, net, extensions
AS $$
  SELECT net.http_get(
    url := rtrim(p_app_url, '/') || '/api/cron/saas',
    headers := jsonb_build_object('Authorization', 'Bearer ' || p_cron_secret),
    timeout_milliseconds := 120000
  );
$$;

REVOKE ALL ON FUNCTION public.invoke_saas_subscription_cron(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoke_saas_subscription_cron(text, text) TO postgres;

DO $$
DECLARE
  v_app_url text := 'YOUR_APP_URL';
  v_cron_secret text := 'YOUR_CRON_SECRET';
  v_command text;
BEGIN
  IF v_app_url = 'YOUR_APP_URL' OR v_cron_secret = 'YOUR_CRON_SECRET' THEN
    RAISE NOTICE 'saas-subscription-daily cron not scheduled: replace YOUR_APP_URL and YOUR_CRON_SECRET in migration 051, then run the schedule block from SUPABASE_CRON_SETUP or SQL editor.';
    RETURN;
  END IF;

  v_command := format(
    $cmd$SELECT public.invoke_saas_subscription_cron(%L, %L);$cmd$,
    v_app_url,
    v_cron_secret
  );

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'saas-subscription-daily') THEN
    PERFORM cron.unschedule('saas-subscription-daily');
  END IF;

  PERFORM cron.schedule(
    'saas-subscription-daily',
    '0 2 * * *',
    v_command
  );
END;
$$;

-- Manual setup (if placeholders were not replaced before db push):
-- SELECT cron.unschedule('saas-subscription-daily');
-- SELECT cron.schedule(
--   'saas-subscription-daily',
--   '0 2 * * *',
--   $$SELECT public.invoke_saas_subscription_cron('https://crmpg.vercel.app', 'your-cron-secret');$$
-- );
--
-- Verify: SELECT * FROM cron.job WHERE jobname = 'saas-subscription-daily';
-- History: SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
-- Test now: SELECT public.invoke_saas_subscription_cron('https://crmpg.vercel.app', 'your-cron-secret');
