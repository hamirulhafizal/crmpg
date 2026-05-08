-- Global admin-managed app settings (singleton-like key/value records).
-- Used for configurable defaults such as automation message templates.

CREATE TABLE IF NOT EXISTS public.admin_app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_app_settings_updated_at
  ON public.admin_app_settings (updated_at DESC);

ALTER TABLE public.admin_app_settings ENABLE ROW LEVEL SECURITY;
