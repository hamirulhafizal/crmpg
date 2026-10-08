-- Bayarcash FPX Direct Debit (e-Mandate) for Google Ads subscriptions.

CREATE TABLE IF NOT EXISTS public.google_ads_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.google_ads_participants (id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.google_ads_subscriptions (id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.google_ads_packages (id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL,
  bayarcash_mandate_id TEXT,
  amount NUMERIC(12, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'MYR',
  frequency_mode TEXT NOT NULL DEFAULT 'MT',
  status TEXT NOT NULL DEFAULT 'pending_enrollment'
    CHECK (
      status = ANY (
        ARRAY[
          'pending_enrollment'::text,
          'active'::text,
          'failed'::text,
          'cancelled'::text,
          'terminated'::text
        ]
      )
    ),
  payer_name TEXT,
  payer_email TEXT,
  payer_phone TEXT,
  payer_id_type INTEGER NOT NULL DEFAULT 1,
  payer_id_last4 TEXT,
  application_reason TEXT,
  effective_date DATE,
  expiry_date DATE,
  enroll_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT google_ads_mandates_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_mandates_participant_id
  ON public.google_ads_mandates (participant_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_mandates_subscription_id
  ON public.google_ads_mandates (subscription_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_mandates_status
  ON public.google_ads_mandates (status);

CREATE TRIGGER update_google_ads_mandates_updated_at
  BEFORE UPDATE ON public.google_ads_mandates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.google_ads_mandates IS
  'Bayarcash e-Mandate (FPX Direct Debit) enrollments for Google Ads auto debit.';

ALTER TABLE public.google_ads_payments
  ADD COLUMN IF NOT EXISTS mandate_id UUID REFERENCES public.google_ads_mandates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_google_ads_payments_mandate_id
  ON public.google_ads_payments (mandate_id);

ALTER TABLE public.google_ads_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read own mandates"
  ON public.google_ads_mandates FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.google_ads_mandates FROM anon, authenticated;
GRANT SELECT ON public.google_ads_mandates TO authenticated;
GRANT ALL ON public.google_ads_mandates TO service_role;
