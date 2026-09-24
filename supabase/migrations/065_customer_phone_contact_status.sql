-- Phone / WhatsApp reachability status (manual dealer override).
-- Separate from computed account status (active/free/freeze/…).

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS phone_contact_status TEXT NOT NULL DEFAULT 'valid';

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_phone_contact_status_check;

ALTER TABLE public.customers
  ADD CONSTRAINT customers_phone_contact_status_check
  CHECK (phone_contact_status IN ('valid', 'invalid', 'changed', 'passed_away'));

COMMENT ON COLUMN public.customers.phone_contact_status IS
  'WhatsApp reachability: valid (OK to message), invalid (cannot contact), changed (wrong person), passed_away. Workflows skip non-valid.';

CREATE INDEX IF NOT EXISTS customers_user_phone_contact_status_idx
  ON public.customers (user_id, phone_contact_status);
