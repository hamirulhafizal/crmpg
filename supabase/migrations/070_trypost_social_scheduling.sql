-- TryPost social scheduling: per-user workspaces + local post mirror + SaaS feature keys.
-- Provisioning model A: assisted create in TryPost UI → paste workspace API key into CRMpg.

CREATE TABLE IF NOT EXISTS public.trypost_workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users (id) ON DELETE CASCADE,
  trypost_workspace_id TEXT NOT NULL,
  trypost_workspace_name TEXT,
  api_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status = ANY (ARRAY['connected'::text, 'disconnected'::text, 'error'::text])),
  last_error TEXT,
  channels JSONB NOT NULL DEFAULT '[]'::jsonb,
  channels_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trypost_workspaces_status
  ON public.trypost_workspaces (status);

COMMENT ON TABLE public.trypost_workspaces IS
  'One TryPost workspace binding per CRMpg user. api_key is the workspace PAT (server-only).';
COMMENT ON COLUMN public.trypost_workspaces.channels IS
  'Cached social accounts from TryPost (Instagram/Facebook preferred).';
COMMENT ON COLUMN public.trypost_workspaces.api_key IS
  'TryPost workspace API key. Never expose via PostgREST to clients.';

CREATE TABLE IF NOT EXISTS public.trypost_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.trypost_workspaces (id) ON DELETE CASCADE,
  trypost_post_id TEXT,
  trypost_post_group_id TEXT,
  social_account_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  content TEXT,
  content_type TEXT,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  publish_mode TEXT NOT NULL DEFAULT 'draft'
    CHECK (publish_mode = ANY (ARRAY[
      'draft'::text,
      'scheduled'::text,
      'queue_next'::text,
      'queue_top'::text,
      'now'::text,
      'pending_approval'::text
    ])),
  scheduled_at TIMESTAMPTZ,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trypost_posts_user_id_created
  ON public.trypost_posts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trypost_posts_workspace_id
  ON public.trypost_posts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_trypost_posts_trypost_post_id
  ON public.trypost_posts (trypost_post_id);
CREATE INDEX IF NOT EXISTS idx_trypost_posts_status
  ON public.trypost_posts (status);

COMMENT ON TABLE public.trypost_posts IS
  'Local mirror of TryPost posts created from CRMpg for history and webhooks.';

CREATE TRIGGER update_trypost_workspaces_updated_at
  BEFORE UPDATE ON public.trypost_workspaces
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_trypost_posts_updated_at
  BEFORE UPDATE ON public.trypost_posts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.trypost_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trypost_posts ENABLE ROW LEVEL SECURITY;

-- Users may read their own rows, but never api_key via a dedicated view-friendly policy:
-- revoke column privilege so authenticated clients cannot SELECT api_key.
CREATE POLICY "Users can select own trypost_workspaces"
  ON public.trypost_workspaces FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can select own trypost_posts"
  ON public.trypost_posts FOR SELECT
  USING (auth.uid() = user_id);

-- Mutations go through Next.js service role APIs only.
REVOKE INSERT, UPDATE, DELETE ON public.trypost_workspaces FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.trypost_posts FROM anon, authenticated;
REVOKE UPDATE (api_key) ON public.trypost_workspaces FROM authenticated;
REVOKE SELECT (api_key) ON public.trypost_workspaces FROM authenticated;

GRANT SELECT (
  id, user_id, trypost_workspace_id, trypost_workspace_name, status, last_error,
  channels, channels_synced_at, created_at, updated_at
) ON public.trypost_workspaces TO authenticated;

GRANT SELECT ON public.trypost_posts TO authenticated;
GRANT ALL ON public.trypost_workspaces TO service_role;
GRANT ALL ON public.trypost_posts TO service_role;

-- SaaS feature keys: free = 1 channel, no analytics; pro = unlimited + analytics.
-- Access itself is true for both; UI is admin-gated in v1.
INSERT INTO public.saas_plan_features (plan_id, feature_key, value)
SELECT p.id, f.feature_key, f.value
FROM public.saas_plans p
CROSS JOIN (
  VALUES
    ('trypost_access', 'true'),
    ('trypost_max_channels', '1'),
    ('trypost_analytics', 'false')
) AS f(feature_key, value)
WHERE p.slug = 'free'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO public.saas_plan_features (plan_id, feature_key, value)
SELECT p.id, f.feature_key, f.value
FROM public.saas_plans p
CROSS JOIN (
  VALUES
    ('trypost_access', 'true'),
    ('trypost_max_channels', '-1'),
    ('trypost_analytics', 'true')
) AS f(feature_key, value)
WHERE p.slug = 'pro'
ON CONFLICT (plan_id, feature_key) DO UPDATE SET value = EXCLUDED.value;
