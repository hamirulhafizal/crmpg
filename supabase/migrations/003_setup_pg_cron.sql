-- Enable pg_cron extension for scheduled jobs
-- This allows us to run cron jobs directly in PostgreSQL
-- Cost: FREE on all Supabase plans

-- Enable the extensions (requires superuser, but Supabase handles this)
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Grant usage to authenticated users (optional, for monitoring)
GRANT USAGE ON SCHEMA cron TO postgres;

-- IMPORTANT: Before running this migration, you need to:
-- 1. Replace 'YOUR_APP_URL' with your actual Vercel/deployment URL (e.g., 'https://crmpg.vercel.app')
-- 2. Replace 'YOUR_CRON_SECRET' with a secure random string (generate with: openssl rand -base64 32)
-- 3. Set the same CRON_SECRET in your Vercel environment variables

-- Schedule hourly birthday automation
-- This will call your API endpoint every hour at minute 0
-- The API will check each user's scheduled time and send messages accordingly
SELECT cron.schedule(
  'birthday-automation-hourly',                    -- Job name (unique identifier)
  '0 * * * *',                                     -- Schedule: Every hour at minute 0 (cron format)
  $$                                               -- SQL to execute
  SELECT net.http_post(
    url := 'YOUR_APP_URL/api/cron/birthday-automation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer YOUR_CRON_SECRET'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- View all scheduled cron jobs
-- SELECT * FROM cron.job;

-- View cron job execution history
-- SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;

-- To unschedule a job:
-- SELECT cron.unschedule('birthday-automation-hourly');

-- To update a job schedule (e.g., run every 30 minutes):
-- SELECT cron.unschedule('birthday-automation-hourly');
-- SELECT cron.schedule(
--   'birthday-automation-hourly',
--   '*/30 * * * *',  -- Every 30 minutes
--   $$...$$
-- );
