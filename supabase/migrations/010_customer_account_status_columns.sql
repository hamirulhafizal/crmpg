-- Canonical fields for account status (G100-style rules in app code).
-- Backfill optional; app falls back to original_data when null.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_purchase_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_monthly_buyer BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.customers.last_purchase_at IS 'Last purchase timestamp; preferred over original_data Last Purchase Date when set.';
COMMENT ON COLUMN public.customers.is_monthly_buyer IS 'True when customer is on monthly purchase (Active / white row in PG tooling).';
