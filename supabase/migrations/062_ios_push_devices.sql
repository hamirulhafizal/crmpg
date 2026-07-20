-- Native iOS APNs device tokens (Phase 3). Linked to auth user for targeting.

CREATE TABLE IF NOT EXISTS public.ios_push_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  apns_environment TEXT NOT NULL DEFAULT 'sandbox'
    CHECK (apns_environment = ANY (ARRAY['sandbox'::text, 'production'::text])),
  bundle_id TEXT NOT NULL DEFAULT 'com.publicgolds.crmpg',
  device_name TEXT,
  app_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ios_push_devices_token_unique UNIQUE (device_token)
);

CREATE INDEX IF NOT EXISTS idx_ios_push_devices_user_id
  ON public.ios_push_devices (user_id);

CREATE INDEX IF NOT EXISTS idx_ios_push_devices_last_seen
  ON public.ios_push_devices (last_seen_at DESC);

COMMENT ON TABLE public.ios_push_devices IS
  'APNs device tokens for native iOS CRM app. Registered via /api/push/ios/register.';

ALTER TABLE public.ios_push_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own ios push devices"
  ON public.ios_push_devices FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own ios push devices"
  ON public.ios_push_devices FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own ios push devices"
  ON public.ios_push_devices FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own ios push devices"
  ON public.ios_push_devices FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ios_push_devices TO authenticated;
GRANT ALL ON public.ios_push_devices TO service_role;
