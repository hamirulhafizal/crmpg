-- WAHA dashboard password (optional), e.g. for linking to server UI
ALTER TABLE public.waha_servers
ADD COLUMN IF NOT EXISTS dashboard_pass TEXT;
