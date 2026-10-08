-- Bayarcash FPX Direct Debit (e-Mandate) for CRM SaaS Pro subscriptions.

CREATE TABLE IF NOT EXISTS public.saas_mandates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.saas_subscriptions (id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES public.saas_plans (id) ON DELETE RESTRICT,
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
  CONSTRAINT saas_mandates_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_saas_mandates_user_id ON public.saas_mandates (user_id);
CREATE INDEX IF NOT EXISTS idx_saas_mandates_subscription_id ON public.saas_mandates (subscription_id);
CREATE INDEX IF NOT EXISTS idx_saas_mandates_status ON public.saas_mandates (status);

CREATE TRIGGER update_saas_mandates_updated_at
  BEFORE UPDATE ON public.saas_mandates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.saas_mandates IS
  'Bayarcash e-Mandate (FPX Direct Debit) enrollments for CRM Pro auto debit.';

ALTER TABLE public.saas_payments
  ADD COLUMN IF NOT EXISTS mandate_id UUID REFERENCES public.saas_mandates (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_saas_payments_mandate_id
  ON public.saas_payments (mandate_id);

ALTER TABLE public.saas_mandates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own saas mandates"
  ON public.saas_mandates FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

REVOKE INSERT, UPDATE, DELETE ON public.saas_mandates FROM anon, authenticated;
GRANT SELECT ON public.saas_mandates TO authenticated;
GRANT ALL ON public.saas_mandates TO service_role;
