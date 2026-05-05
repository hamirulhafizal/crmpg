-- Payment attempts / receipts for Google Ads campaign (Bayarcash).

CREATE TABLE IF NOT EXISTS public.google_ads_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id UUID NOT NULL REFERENCES public.google_ads_participants (id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.google_ads_subscriptions (id) ON DELETE CASCADE,
  package_id UUID NOT NULL REFERENCES public.google_ads_packages (id) ON DELETE RESTRICT,
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
  CONSTRAINT google_ads_payments_order_number_key UNIQUE (order_number)
);

CREATE INDEX IF NOT EXISTS idx_google_ads_payments_participant_id ON public.google_ads_payments (participant_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_payments_subscription_id ON public.google_ads_payments (subscription_id);
CREATE INDEX IF NOT EXISTS idx_google_ads_payments_order_number ON public.google_ads_payments (order_number);
CREATE INDEX IF NOT EXISTS idx_google_ads_payments_payment_intent_id ON public.google_ads_payments (payment_intent_id);

CREATE TRIGGER update_google_ads_payments_updated_at
  BEFORE UPDATE ON public.google_ads_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.google_ads_payments IS 'Bayarcash payment intents / receipt references for Google Ads subscriptions.';
COMMENT ON COLUMN public.google_ads_payments.order_number IS 'CRM reference sent to Bayarcash (invoice / order no.).';
COMMENT ON COLUMN public.google_ads_payments.receipt_label IS 'Human-readable receipt line, e.g. FPX ref.';

ALTER TABLE public.google_ads_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can read own payments"
  ON public.google_ads_payments FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.google_ads_participants p
      WHERE p.id = participant_id AND p.user_id = auth.uid()
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.google_ads_payments FROM anon, authenticated;

GRANT SELECT ON public.google_ads_payments TO authenticated;
GRANT ALL ON public.google_ads_payments TO service_role;
