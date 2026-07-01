-- Device-scoped web push subscriptions (no user account link).

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  device_info JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_last_seen
  ON public.push_subscriptions (last_seen_at DESC);

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscription endpoints per device/browser. Managed via service role API.';

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
