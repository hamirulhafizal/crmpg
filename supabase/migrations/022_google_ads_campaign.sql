-- Google Ads campaign participation: price-only packages (monthly/yearly), subscriptions, Bayarcash-ready fields.

CREATE TABLE IF NOT EXISTS public.google_ads_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  billing_period TEXT NOT NULL CHECK (billing_period = ANY (ARRAY['monthly'::text, 'yearly'::text])),
  price_amount NUMERIC(12, 2) NOT NULL CHECK (price_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'MYR',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_google_ads_packages_period_unique
  ON public.google_ads_packages (billing_period)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_google_ads_packages_sort ON public.google_ads_packages (sort_order, created_at);

CREATE TABLE IF NOT EXISTS public.google_ads_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_ads_participants_user_id_key UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_participants_user_id ON public.google_ads_participants (user_id);

CREATE TABLE IF NOT EXISTS public.google_ads_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.google_ads_participants (id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.google_ads_packages (id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'pending_payment'
    CHECK (status = ANY (ARRAY[
      'active'::text,
      'expired'::text,
      'cancelled'::text,
      'pending_payment'::text
    ])),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  pending_renewal_package_id UUID REFERENCES public.google_ads_packages (id) ON DELETE SET NULL,
  payment_provider TEXT DEFAULT 'bayarcash',
  external_payment_id TEXT,
  payment_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_ads_subscriptions_participant_id_key UNIQUE (participant_id)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_subscriptions_status ON public.google_ads_subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_google_ads_subscriptions_period_end ON public.google_ads_subscriptions (current_period_end);

CREATE TRIGGER update_google_ads_packages_updated_at
  BEFORE UPDATE ON public.google_ads_packages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_ads_participants_updated_at
  BEFORE UPDATE ON public.google_ads_participants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_google_ads_subscriptions_updated_at
  BEFORE UPDATE ON public.google_ads_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.google_ads_packages IS 'Google Ads campaign billing packages (monthly/yearly); price only, no Ads API.';
COMMENT ON TABLE public.google_ads_participants IS 'Users enrolled in the Google Ads campaign program.';
COMMENT ON COLUMN public.google_ads_subscriptions.pending_renewal_package_id IS 'Package chosen at renewal; applied when payment is confirmed.';
COMMENT ON COLUMN public.google_ads_subscriptions.payment_metadata IS 'Gateway payloads and audit fields (e.g. bayarcash reference).';

ALTER TABLE public.google_ads_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_ads_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can read active packages"
  ON public.google_ads_packages FOR SELECT
  TO authenticated
  USING (is_active = TRUE);

CREATE POLICY "Participants can read own enrollment"
  ON public.google_ads_participants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Participants can read own subscription"
  ON public.google_ads_subscriptions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.google_ads_packages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.google_ads_participants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.google_ads_subscriptions FROM anon, authenticated;

GRANT SELECT ON public.google_ads_packages TO authenticated;
GRANT SELECT ON public.google_ads_participants TO authenticated;
GRANT SELECT ON public.google_ads_subscriptions TO authenticated;

GRANT ALL ON public.google_ads_packages TO service_role;
GRANT ALL ON public.google_ads_participants TO service_role;
GRANT ALL ON public.google_ads_subscriptions TO service_role;

-- Seed default packages when empty (edit prices in admin as needed)
INSERT INTO public.google_ads_packages (name, billing_period, price_amount, currency, sort_order)
SELECT * FROM (VALUES
  ('Google Ads — Monthly', 'monthly'::text, 99.00::numeric, 'MYR'::text, 1),
  ('Google Ads — Yearly', 'yearly'::text, 999.00::numeric, 'MYR'::text, 2)
) AS v(name, billing_period, price_amount, currency, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.google_ads_packages LIMIT 1);
