-- Campaigns module: multi-step WhatsApp automation with audience filters, enrollments, and logs.

CREATE TABLE IF NOT EXISTS public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
  trigger_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (trigger_type IN ('manual', 'birthday', 'last_purchase', 'enrollment')),
  trigger_offset_days INTEGER NOT NULL DEFAULT 0,
  timezone TEXT DEFAULT 'Asia/Kuala_Lumpur',
  audience_filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  daily_send_limit INTEGER NOT NULL DEFAULT 100 CHECK (daily_send_limit >= 1),
  cooldown_days INTEGER NOT NULL DEFAULT 30 CHECK (cooldown_days >= 0),
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON public.campaigns (user_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON public.campaigns (status);

CREATE TABLE IF NOT EXISTS public.campaign_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  campaign_id UUID NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  step_order INTEGER NOT NULL CHECK (step_order >= 1),
  delay_days INTEGER NOT NULL DEFAULT 0 CHECK (delay_days >= 0),
  send_time TIME NOT NULL DEFAULT TIME '10:00',
  message_template TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  UNIQUE (campaign_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_campaign_steps_campaign_id ON public.campaign_steps (campaign_id);

CREATE TABLE IF NOT EXISTS public.campaign_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  campaign_id UUID NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'paused', 'removed')),
  last_step_sent INTEGER NOT NULL DEFAULT 0 CHECK (last_step_sent >= 0),
  next_send_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (campaign_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_next ON public.campaign_enrollments (campaign_id, status, next_send_at)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_campaign_enrollments_user ON public.campaign_enrollments (user_id);

CREATE TABLE IF NOT EXISTS public.campaign_message_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  campaign_id UUID NOT NULL REFERENCES public.campaigns (id) ON DELETE CASCADE,
  campaign_step_id UUID REFERENCES public.campaign_steps (id) ON DELETE SET NULL,
  enrollment_id UUID REFERENCES public.campaign_enrollments (id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone TEXT,
  rendered_message TEXT,
  send_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (send_status IN ('pending', 'sent', 'failed', 'skipped')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  waha_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_campaign_logs_campaign_created ON public.campaign_message_logs (campaign_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaign_logs_user ON public.campaign_message_logs (user_id);

CREATE TRIGGER update_campaigns_updated_at
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

COMMENT ON TABLE public.campaigns IS 'User-owned WhatsApp drip campaigns (audience filters + steps).';
COMMENT ON COLUMN public.campaigns.audience_filters IS 'JSON: tag_slugs[], tag_ids[], account_status[], is_monthly_buyer, gender, location_contains, last_purchase_days_gt, segment_attributes path filters.';

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_message_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_select_own" ON public.campaigns FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "campaigns_insert_own" ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "campaigns_update_own" ON public.campaigns FOR UPDATE TO authenticated
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "campaigns_delete_own" ON public.campaigns FOR DELETE TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "campaign_steps_all_own"
  ON public.campaign_steps FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid ()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_steps.campaign_id AND c.user_id = auth.uid ()
    )
  );

CREATE POLICY "campaign_enrollments_all_own"
  ON public.campaign_enrollments FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_enrollments.campaign_id AND c.user_id = auth.uid ()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_enrollments.campaign_id AND c.user_id = auth.uid ()
    )
  );

CREATE POLICY "campaign_logs_all_own"
  ON public.campaign_message_logs FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_message_logs.campaign_id AND c.user_id = auth.uid ()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_message_logs.campaign_id AND c.user_id = auth.uid ()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_enrollments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_message_logs TO authenticated;

-- ---------------------------------------------------------------------------
-- RPC: returns customer IDs matching simple tag filters + owning user.
-- Full audience matching (account status, segment_attributes) is completed in app code;
-- this assists SQL previews and can be extended.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_campaign_audience (p_campaign_id UUID)
RETURNS TABLE (customer_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID;
  v_filters JSONB;
  v_tag_slugs TEXT[];
  v_tag_ids UUID[];
BEGIN
  SELECT c.user_id, c.audience_filters INTO v_user, v_filters
  FROM public.campaigns c
  WHERE c.id = p_campaign_id;

  IF v_user IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid () IS DISTINCT FROM v_user THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  v_tag_slugs := COALESCE(
    ARRAY (SELECT jsonb_array_elements_text(COALESCE(v_filters -> 'tag_slugs', '[]'::jsonb))),
    ARRAY[]::TEXT[]
  );
  v_tag_ids := COALESCE(
    ARRAY (
      SELECT (elem #>> '{}')::uuid
      FROM jsonb_array_elements(COALESCE(v_filters -> 'tag_ids', '[]'::jsonb)) AS elem
    ),
    ARRAY[]::UUID[]
  );

  RETURN QUERY
  SELECT cu.id
  FROM public.customers cu
  WHERE cu.user_id = v_user
    AND cu.phone IS NOT NULL
    AND TRIM(cu.phone) <> ''
    AND (
      (CARDINALITY(v_tag_slugs) = 0 AND CARDINALITY(v_tag_ids) = 0)
      OR EXISTS (
        SELECT 1
        FROM public.customer_tags ct
        JOIN public.tags t ON t.id = ct.tag_id
        WHERE ct.customer_id = cu.id
          AND ct.user_id = v_user
          AND (
            (CARDINALITY(v_tag_slugs) > 0 AND t.slug = ANY (v_tag_slugs))
            OR (CARDINALITY(v_tag_ids) > 0 AND t.id = ANY (v_tag_ids))
          )
      )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_campaign_audience (UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_campaign_audience (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_campaign_audience (UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- Bulk-enroll customers returned by get_campaign_audience (insert-only).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enroll_campaign_customers (p_campaign_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER := 0;
  v_owner UUID;
BEGIN
  SELECT c.user_id INTO v_owner FROM public.campaigns c WHERE c.id = p_campaign_id;
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'campaign not found';
  END IF;

  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    IF auth.uid () IS DISTINCT FROM v_owner THEN
      RAISE EXCEPTION 'not authorized';
    END IF;
  END IF;

  INSERT INTO public.campaign_enrollments (campaign_id, customer_id, user_id, status, metadata)
  SELECT p_campaign_id, a.customer_id, c.user_id, 'active', '{}'::jsonb
  FROM public.get_campaign_audience (p_campaign_id) AS a (customer_id)
  JOIN public.campaigns c ON c.id = p_campaign_id
  ON CONFLICT (campaign_id, customer_id) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enroll_campaign_customers (UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enroll_campaign_customers (UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.enroll_campaign_customers (UUID) TO service_role;

COMMENT ON FUNCTION public.get_campaign_audience IS 'Tag-based audience subset; merge with app-side filters for account status.';
COMMENT ON FUNCTION public.enroll_campaign_customers IS 'Inserts enrollments for tag-audience matches; app should enroll after full filter resolution when needed.';
