-- Allow campaign cron (service role) to write follow-up activity logs.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_follow_up_activities TO service_role;
