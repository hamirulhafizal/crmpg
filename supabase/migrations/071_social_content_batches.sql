-- Auto content generator batches (7-day drafts → approve → TryPost).

CREATE TABLE IF NOT EXISTS public.social_content_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES public.trypost_workspaces (id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status = ANY (ARRAY[
      'pending_review'::text,
      'approved'::text,
      'discarded'::text
    ])),
  days INT NOT NULL DEFAULT 7,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  social_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_social_content_batches_user_created
  ON public.social_content_batches (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.social_content_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.social_content_batches (id) ON DELETE CASCADE,
  day_index INT NOT NULL CHECK (day_index >= 0),
  category_id TEXT NOT NULL,
  category_label TEXT NOT NULL,
  caption TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  media_source TEXT,
  media_key TEXT,
  media_title TEXT,
  suggested_at TIMESTAMPTZ,
  social_account_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  trypost_post_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status = ANY (ARRAY[
      'draft'::text,
      'approved'::text,
      'failed'::text,
      'skipped'::text
    ])),
  last_error TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (batch_id, day_index)
);

CREATE INDEX IF NOT EXISTS idx_social_content_batch_items_batch
  ON public.social_content_batch_items (batch_id);

CREATE TABLE IF NOT EXISTS public.social_content_media_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  media_key TEXT NOT NULL,
  media_url TEXT,
  category_id TEXT,
  batch_item_id UUID REFERENCES public.social_content_batch_items (id) ON DELETE SET NULL,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, media_key)
);

CREATE INDEX IF NOT EXISTS idx_social_content_media_usage_user_used
  ON public.social_content_media_usage (user_id, used_at DESC);

CREATE TRIGGER update_social_content_batches_updated_at
  BEFORE UPDATE ON public.social_content_batches
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_social_content_batch_items_updated_at
  BEFORE UPDATE ON public.social_content_batch_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.social_content_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content_batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_content_media_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own social_content_batches"
  ON public.social_content_batches FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can select own social_content_batch_items"
  ON public.social_content_batch_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.social_content_batches b
      WHERE b.id = batch_id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can select own social_content_media_usage"
  ON public.social_content_media_usage FOR SELECT
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.social_content_batches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_content_batch_items FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.social_content_media_usage FROM anon, authenticated;

GRANT SELECT ON public.social_content_batches TO authenticated;
GRANT SELECT ON public.social_content_batch_items TO authenticated;
GRANT SELECT ON public.social_content_media_usage TO authenticated;
GRANT ALL ON public.social_content_batches TO service_role;
GRANT ALL ON public.social_content_batch_items TO service_role;
GRANT ALL ON public.social_content_media_usage TO service_role;
