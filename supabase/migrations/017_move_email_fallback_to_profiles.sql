-- Move Gmail fallback settings from waha_user_sessions to profiles.
-- Per request, no backfill is performed; app reads profiles immediately.

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS gmail_app_password TEXT,
ADD COLUMN IF NOT EXISTS gmail_message TEXT;

ALTER TABLE public.waha_user_sessions
DROP COLUMN IF EXISTS gmaill_app_password,
DROP COLUMN IF EXISTS gmail_message;
