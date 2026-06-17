-- Multi-tier platform default workflows (free signup + pro trial/paid packs).

ALTER TABLE public.campaign_platform_defaults
  DROP CONSTRAINT IF EXISTS campaign_platform_defaults_id_check;

ALTER TABLE public.campaign_platform_defaults
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free', 'pro')),
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

UPDATE public.campaign_platform_defaults
SET tier = 'free', sort_order = 0
WHERE id = 'default';

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS platform_default_id TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'campaigns_platform_default_id_fkey'
  ) THEN
    ALTER TABLE public.campaigns
      ADD CONSTRAINT campaigns_platform_default_id_fkey
      FOREIGN KEY (platform_default_id)
      REFERENCES public.campaign_platform_defaults (id)
      ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.campaigns
SET platform_default_id = 'default'
WHERE uses_platform_defaults = TRUE
  AND platform_default_id IS NULL;

COMMENT ON COLUMN public.campaign_platform_defaults.tier IS 'free = signup default; pro = provisioned on Pro trial or paid subscription.';
COMMENT ON COLUMN public.campaigns.platform_default_id IS 'Links user campaign copy to a platform template for sync and tier gating.';

CREATE OR REPLACE FUNCTION public.provision_platform_defaults_for_tier(p_user_id UUID, p_tier TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_defaults public.campaign_platform_defaults%ROWTYPE;
  v_campaign_id UUID;
  v_step JSONB;
  v_order INT;
  v_send_time TIME;
BEGIN
  IF p_tier NOT IN ('free', 'pro') THEN
    RETURN;
  END IF;

  FOR v_defaults IN
    SELECT *
    FROM public.campaign_platform_defaults
    WHERE tier = p_tier
    ORDER BY sort_order ASC, created_at ASC
  LOOP
    IF v_defaults.workflow_definition IS NULL
      OR v_defaults.workflow_definition = '{}'::jsonb
      OR NOT (v_defaults.workflow_definition ? 'nodes')
    THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.campaigns
      WHERE user_id = p_user_id AND platform_default_id = v_defaults.id
    ) THEN
      CONTINUE;
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
      uses_platform_defaults,
      platform_default_id
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
      TRUE,
      v_defaults.id
    )
    RETURNING id INTO v_campaign_id;

    v_order := 0;
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
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_platform_default_campaign(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.provision_platform_defaults_for_tier(p_user_id, 'free');
END;
$$;

COMMENT ON FUNCTION public.provision_platform_defaults_for_tier IS
  'Clones all platform templates for a tier into draft user campaigns (skips templates already provisioned).';

GRANT EXECUTE ON FUNCTION public.provision_platform_defaults_for_tier(UUID, TEXT) TO service_role;
