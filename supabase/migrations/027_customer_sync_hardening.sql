-- Customer sync hardening (phase 1):
-- 1) explicit sync timestamp
-- 2) duplicate prevention strategy
-- 3) basic sync-run audit log

-- ---------------------------------------------------------------------------
-- Customers: sync metadata + normalized match keys
-- ---------------------------------------------------------------------------
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS phone_e164 TEXT,
  ADD COLUMN IF NOT EXISTS email_normalized TEXT;

COMMENT ON COLUMN public.customers.last_synced_at IS 'When this customer row was last synchronized from an external source.';
COMMENT ON COLUMN public.customers.phone_e164 IS 'Normalized phone digits used for duplicate-safe matching.';
COMMENT ON COLUMN public.customers.email_normalized IS 'Lowercased trimmed email used for duplicate-safe matching.';

UPDATE public.customers
SET last_synced_at = COALESCE(last_synced_at, updated_at)
WHERE last_synced_at IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_customer_sync_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.phone IS NULL THEN
    NEW.phone_e164 := NULL;
  ELSE
    NEW.phone_e164 := regexp_replace(NEW.phone, '\D', '', 'g');
    IF NEW.phone_e164 = '' THEN
      NEW.phone_e164 := NULL;
    ELSIF NEW.phone_e164 LIKE '0%' THEN
      NEW.phone_e164 := '6' || NEW.phone_e164;
    ELSIF NEW.phone_e164 NOT LIKE '60%' AND length(NEW.phone_e164) >= 9 THEN
      NEW.phone_e164 := '60' || NEW.phone_e164;
    END IF;
  END IF;

  IF NEW.email IS NULL THEN
    NEW.email_normalized := NULL;
  ELSE
    NEW.email_normalized := lower(btrim(NEW.email));
    IF NEW.email_normalized = '' THEN
      NEW.email_normalized := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_sync_keys ON public.customers;
CREATE TRIGGER trg_customers_normalize_sync_keys
BEFORE INSERT OR UPDATE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.normalize_customer_sync_keys();

-- Backfill normalized keys for existing rows.
UPDATE public.customers
SET
  phone_e164 = CASE
    WHEN phone IS NULL THEN NULL
    WHEN regexp_replace(phone, '\D', '', 'g') = '' THEN NULL
    WHEN regexp_replace(phone, '\D', '', 'g') LIKE '0%' THEN '6' || regexp_replace(phone, '\D', '', 'g')
    WHEN regexp_replace(phone, '\D', '', 'g') NOT LIKE '60%' AND length(regexp_replace(phone, '\D', '', 'g')) >= 9
      THEN '60' || regexp_replace(phone, '\D', '', 'g')
    ELSE regexp_replace(phone, '\D', '', 'g')
  END,
  email_normalized = NULLIF(lower(btrim(email)), '')
WHERE TRUE;

CREATE INDEX IF NOT EXISTS idx_customers_user_pg_code ON public.customers (user_id, pg_code);
CREATE INDEX IF NOT EXISTS idx_customers_user_phone_e164 ON public.customers (user_id, phone_e164);
CREATE INDEX IF NOT EXISTS idx_customers_user_email_normalized ON public.customers (user_id, email_normalized);
CREATE INDEX IF NOT EXISTS idx_customers_last_synced_at ON public.customers (last_synced_at DESC);

-- Try to enforce unique safety where possible.
-- If legacy duplicates exist, skip unique index creation without failing migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.customers
    WHERE pg_code IS NOT NULL AND btrim(pg_code) <> ''
    GROUP BY user_id, btrim(pg_code)
    HAVING COUNT(*) > 1
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uq_customers_user_pg_code_nonempty
             ON public.customers (user_id, pg_code)
             WHERE pg_code IS NOT NULL AND btrim(pg_code) <> ''''';
  ELSE
    RAISE NOTICE 'Skipped uq_customers_user_pg_code_nonempty because duplicates currently exist.';
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Sync runs audit table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'extension',
  mode TEXT NOT NULL DEFAULT 'customers_page',
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  total_rows INTEGER,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_sync_runs_user_created_at
  ON public.customer_sync_runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_sync_runs_user_status
  ON public.customer_sync_runs (user_id, status);

ALTER TABLE public.customer_sync_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_sync_runs'
      AND policyname = 'Users can view their own customer sync runs'
  ) THEN
    CREATE POLICY "Users can view their own customer sync runs"
      ON public.customer_sync_runs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_sync_runs'
      AND policyname = 'Users can insert their own customer sync runs'
  ) THEN
    CREATE POLICY "Users can insert their own customer sync runs"
      ON public.customer_sync_runs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'customer_sync_runs'
      AND policyname = 'Users can update their own customer sync runs'
  ) THEN
    CREATE POLICY "Users can update their own customer sync runs"
      ON public.customer_sync_runs
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DROP TRIGGER IF EXISTS update_customer_sync_runs_updated_at ON public.customer_sync_runs;
CREATE TRIGGER update_customer_sync_runs_updated_at
BEFORE UPDATE ON public.customer_sync_runs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
