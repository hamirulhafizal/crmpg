-- Platform SaaS plans (Free / Pro). Separate from google_ads_packages add-on.
-- v1: one subscription per user; organization_id reserved for future seats.

CREATE TABLE IF NOT EXISTS public.saas_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  billing_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (billing_period = ANY (ARRAY['monthly'::text, 'yearly'::text, 'none'::text])),
  price_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (price_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  trial_days INTEGER NOT NULL DEFAULT 0 CHECK (trial_days >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  marketing_details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saas_plans_slug_key UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_saas_plans_active_sort ON public.saas_plans (is_active, sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.saas_plan_features (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.saas_plans (id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saas_plan_features_plan_feature_key UNIQUE (plan_id, feature_key)
);

CREATE INDEX IF NOT EXISTS idx_saas_plan_features_plan_id ON public.saas_plan_features (plan_id);

CREATE TABLE IF NOT EXISTS public.saas_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  organization_id UUID,
  plan_id UUID NOT NULL REFERENCES public.saas_plans (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status = ANY (ARRAY[
      'trialing'::text,
      'active'::text,
      'expired'::text,
      'cancelled'::text
    ])),
  locked_price_amount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (locked_price_amount >= 0),
  locked_currency TEXT NOT NULL DEFAULT 'MYR',
  trial_ends_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  payment_provider TEXT DEFAULT 'bayarcash',
  payment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  admin_assigned_by UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  admin_assigned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saas_subscriptions_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_plan_id ON public.saas_subscriptions (plan_id);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_status ON public.saas_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_period_end ON public.saas_subscriptions (current_period_end);
CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_org_id ON public.saas_subscriptions (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.saas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.saas_subscriptions (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.saas_plans (id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  payment_intent_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'failed'::text, 'cancelled'::text])),
  payer_name TEXT,
  payer_email TEXT,
  payer_phone TEXT,
  bayarcash_transaction_id TEXT,
  exchange_reference_number TEXT,
  receipt_label TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT saas_payments_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_saas_payments_subscription_id ON public.saas_payments (subscription_id);
CREATE INDEX IF NOT EXISTS idx_saas_payments_user_id ON public.saas_payments (user_id);

CREATE TRIGGER update_saas_plans_updated_at
  BEFORE UPDATE ON public.saas_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saas_plan_features_updated_at
  BEFORE UPDATE ON public.saas_plan_features
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saas_subscriptions_updated_at
  BEFORE UPDATE ON public.saas_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saas_payments_updated_at
  BEFORE UPDATE ON public.saas_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.saas_plans IS 'Platform CRM subscription tiers (Free, Pro). Google Ads remains a separate add-on.';
COMMENT ON TABLE public.saas_plan_features IS 'Feature limits/flags per plan (max_active_campaigns, whatsapp_providers, …).';
COMMENT ON COLUMN public.saas_subscriptions.locked_price_amount IS 'Grandfathered price at signup/renewal; list price changes do not affect existing subs.';
COMMENT ON COLUMN public.saas_subscriptions.organization_id IS 'Reserved for future org/seat billing; NULL in v1 (1 user per sub).';

ALTER TABLE public.saas_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read active saas plans"
  ON public.saas_plans FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Authenticated can read features of active plans"
  ON public.saas_plan_features FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.saas_plans p
      WHERE p.id = plan_id AND p.is_active = TRUE
    )
  );

CREATE POLICY "Users can read own saas subscription"
  ON public.saas_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can read own saas payments"
  ON public.saas_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

REVOKE INSERT, UPDATE, DELETE ON public.saas_plans FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.saas_plan_features FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.saas_subscriptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.saas_payments FROM anon, authenticated;

GRANT SELECT ON public.saas_plans TO authenticated;
GRANT SELECT ON public.saas_plan_features TO authenticated;
GRANT SELECT ON public.saas_subscriptions TO authenticated;
GRANT SELECT ON public.saas_payments TO authenticated;

GRANT ALL ON public.saas_plans TO service_role;
GRANT ALL ON public.saas_plan_features TO service_role;
GRANT ALL ON public.saas_subscriptions TO service_role;
GRANT ALL ON public.saas_payments TO service_role;

-- ---------------------------------------------------------------------------
-- Seed Free + Pro (edit in admin)
-- ---------------------------------------------------------------------------
INSERT INTO public.saas_plans (slug, name, description, billing_period, price_amount, currency, trial_days, sort_order, marketing_details)
SELECT * FROM (VALUES
  (
    'free'::text,
    'Free'::text,
    'Get started with core CRM and one active campaign.'::text,
    'none'::text,
    0::numeric,
    'MYR'::text,
    0::integer,
    1::integer,
    '{"bullets":["1 active campaign","WhatsApp via WAHA","Core CRM features"]}'::jsonb
  ),
  (
    'pro'::text,
    'Pro'::text,
    'Unlimited campaigns and WasenderAPI WhatsApp for growing dealers.'::text,
    'monthly'::text,
    99::numeric,
    'MYR'::text,
    14::integer,
    2::integer,
    '{"bullets":["Unlimited active campaigns","WhatsApp via WasenderAPI","Priority platform access"]}'::jsonb
  )
) AS v(slug, name, description, billing_period, price_amount, currency, trial_days, sort_order, marketing_details)
WHERE NOT EXISTS (SELECT 1 FROM public.saas_plans LIMIT 1);

INSERT INTO public.saas_plan_features (plan_id, feature_key, value)
SELECT p.id, f.feature_key, f.value
FROM public.saas_plans p
CROSS JOIN (
  VALUES
    ('free', 'max_active_campaigns', '1'),
    ('free', 'whatsapp_providers', 'waha'),
    ('free', 'platform_access', 'true'),
    ('pro', 'max_active_campaigns', '-1'),
    ('pro', 'whatsapp_providers', 'waha,wasender'),
    ('pro', 'platform_access', 'true')
) AS f(slug, feature_key, value)
WHERE p.slug = f.slug
ON CONFLICT (plan_id, feature_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Ensure Free subscription for a user (signup + backfill)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ensure_saas_free_subscription(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_currency TEXT;
BEGIN
  SELECT id, currency INTO v_plan_id, v_currency
  FROM public.saas_plans
  WHERE slug = 'free' AND is_active = TRUE
  ORDER BY sort_order
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.saas_subscriptions (
    user_id,
    plan_id,
    status,
    locked_price_amount,
    locked_currency,
    current_period_start
  )
  VALUES (
    p_user_id,
    v_plan_id,
    'active',
    0,
    COALESCE(v_currency, 'MYR'),
    NOW()
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.ensure_saas_free_subscription IS 'Creates Free platform subscription if user has none.';

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

  RETURN NEW;
END;
$$;

-- Backfill existing profiles → Free
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.profiles LOOP
    PERFORM public.ensure_saas_free_subscription(r.id);
  END LOOP;
END;
$$;
