-- Platform default campaign workflow: auto-provisioned on signup, admin-configurable, syncs to linked user campaigns.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS uses_platform_defaults BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.campaigns.uses_platform_defaults IS
  'When true, admin platform default updates sync until the user saves custom campaign edits.';

CREATE TABLE IF NOT EXISTS public.campaign_platform_defaults (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  name TEXT NOT NULL DEFAULT 'Birthday',
  description TEXT,
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'birthday', 'last_purchase', 'enrollment')),
  trigger_offset_days INTEGER NOT NULL DEFAULT 0,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_send_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_send_limit >= 1),
  cooldown_days INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_days >= 0),
  workflow_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  workflow_layout JSONB,
  compiled_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_campaign_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS update_campaign_platform_defaults_updated_at ON public.campaign_platform_defaults;
CREATE TRIGGER update_campaign_platform_defaults_updated_at
  BEFORE UPDATE ON public.campaign_platform_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaign_platform_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "campaign_platform_defaults_select_authenticated" ON public.campaign_platform_defaults;
CREATE POLICY "campaign_platform_defaults_select_authenticated"
  ON public.campaign_platform_defaults FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "campaign_platform_defaults_admin_all" ON public.campaign_platform_defaults;
CREATE POLICY "campaign_platform_defaults_admin_all"
  ON public.campaign_platform_defaults FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

GRANT SELECT ON public.campaign_platform_defaults TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.campaign_platform_defaults TO authenticated;

-- Shared platform workflow media (read-only for all authenticated users).
DROP POLICY IF EXISTS "campaign_workflow_media_select_platform_defaults" ON storage.objects;
CREATE POLICY "campaign_workflow_media_select_platform_defaults"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'campaign-workflow-media'
  AND (storage.foldername(name))[1] = 'platform-defaults'
);

CREATE OR REPLACE FUNCTION public.provision_platform_default_campaign(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults public.campaign_platform_defaults%ROWTYPE;
  v_campaign_id UUID;
  v_step JSONB;
  v_order INT := 0;
  v_send_time TIME;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.campaigns
    WHERE user_id = p_user_id AND uses_platform_defaults = TRUE
  ) THEN
    RETURN;
  END IF;

  SELECT * INTO v_defaults
  FROM public.campaign_platform_defaults
  WHERE id = 'default';

  IF NOT FOUND
    OR v_defaults.workflow_definition IS NULL
    OR v_defaults.workflow_definition = '{}'::jsonb
    OR NOT (v_defaults.workflow_definition ? 'nodes')
  THEN
    RETURN;
  END IF;

  INSERT INTO public.campaigns (
    user_id,
    name,
    description,
    status,
    trigger_type,
    trigger_offset_days,
    timezone,
    audience_filters,
    daily_send_limit,
    cooldown_days,
    workflow_definition,
    workflow_layout,
    uses_platform_defaults
  ) VALUES (
    p_user_id,
    v_defaults.name,
    v_defaults.description,
    'draft',
    v_defaults.trigger_type,
    v_defaults.trigger_offset_days,
    v_defaults.timezone,
    v_defaults.audience_filters,
    v_defaults.daily_send_limit,
    v_defaults.cooldown_days,
    v_defaults.workflow_definition,
    v_defaults.workflow_layout,
    TRUE
  )
  RETURNING id INTO v_campaign_id;

  FOR v_step IN
    SELECT value FROM jsonb_array_elements(COALESCE(v_defaults.compiled_steps, '[]'::jsonb))
  LOOP
    v_order := v_order + 1;
    v_send_time := NULL;
    IF COALESCE(v_step->>'send_time', '') <> '' THEN
      v_send_time := (v_step->>'send_time')::TIME;
    END IF;

    INSERT INTO public.campaign_steps (
      campaign_id,
      step_order,
      delay_days,
      send_time,
      message_template,
      is_active
    ) VALUES (
      v_campaign_id,
      COALESCE((v_step->>'step_order')::INT, v_order),
      GREATEST(0, COALESCE((v_step->>'delay_days')::INT, 0)),
      v_send_time,
      COALESCE(v_step->>'message_template', ''),
      COALESCE((v_step->>'is_active')::BOOLEAN, TRUE)
    );
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.provision_platform_default_campaign IS
  'Creates draft Birthday (platform default) campaign for a new user if defaults are configured.';

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.ensure_saas_free_subscription(NEW.id);
  PERFORM public.provision_platform_default_campaign(NEW.id);

  RETURN NEW;
END;
$$;

COMMENT ON TABLE public.campaign_platform_defaults IS
  'Singleton default campaign workflow cloned to every new user on signup.';
