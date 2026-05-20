-- Allow campaign steps without a fixed send time (NULL = send as soon as due).
ALTER TABLE public.campaign_steps
  ALTER COLUMN send_time DROP NOT NULL;

COMMENT ON COLUMN public.campaign_steps.send_time IS
  'Local wall-clock send time in campaign timezone. NULL = send immediately when the step becomes due.';
