-- Customer self-service portal: OTP verification records (server-only via service role)

CREATE TABLE IF NOT EXISTS public.customer_portal_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  send_count INTEGER NOT NULL DEFAULT 1,
  identifier_kind TEXT NOT NULL CHECK (identifier_kind IN ('pg_code', 'phone')),
  identifier_normalized TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_customer_portal_otps_customer_created
  ON public.customer_portal_otps (customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_customer_portal_otps_identifier_created
  ON public.customer_portal_otps (identifier_normalized, created_at DESC);

ALTER TABLE public.customer_portal_otps ENABLE ROW LEVEL SECURITY;

-- No policies: only service role should access this table.

COMMENT ON TABLE public.customer_portal_otps IS
  'WhatsApp TAC codes for customer portal login. Access via service role only.';
