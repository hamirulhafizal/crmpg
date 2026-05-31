-- Admin media library metadata (files stored in Cloudflare R2).

CREATE TABLE IF NOT EXISTS public.admin_media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN ('image', 'audio', 'video', 'pdf')),
  mime_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  r2_key TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT '',
  uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_media_assets_media_type
  ON public.admin_media_assets (media_type);

CREATE INDEX IF NOT EXISTS idx_admin_media_assets_folder
  ON public.admin_media_assets (folder);

CREATE INDEX IF NOT EXISTS idx_admin_media_assets_created_at
  ON public.admin_media_assets (created_at DESC);

COMMENT ON TABLE public.admin_media_assets IS
  'Admin-managed media metadata. Binary files live in Cloudflare R2 (bucket configured in admin_app_settings key media_r2).';

ALTER TABLE public.admin_media_assets ENABLE ROW LEVEL SECURITY;
