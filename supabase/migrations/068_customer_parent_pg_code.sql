-- Hierarchy edge for Tree Tier / Team frontline navigation.
-- Immediate upline PG code (from BC sync). Used to list direct frontline of a dealer.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS parent_pg_code TEXT;

COMMENT ON COLUMN public.customers.parent_pg_code IS
  'Immediate upline PG code (normalized). Null when unknown or root under the dealer account.';

-- Normalize blank / placeholder parent codes to NULL on write.
CREATE OR REPLACE FUNCTION public.normalize_customer_parent_pg_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.parent_pg_code IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.parent_pg_code := upper(btrim(NEW.parent_pg_code));

  IF NEW.parent_pg_code = ''
     OR NEW.parent_pg_code IN ('-', '—', '–', 'N/A', 'NA', 'NONE', 'NIL', '.', '--', 'NULL')
  THEN
    NEW.parent_pg_code := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_normalize_parent_pg_code ON public.customers;
CREATE TRIGGER trg_customers_normalize_parent_pg_code
BEFORE INSERT OR UPDATE OF parent_pg_code ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.normalize_customer_parent_pg_code();

CREATE INDEX IF NOT EXISTS idx_customers_user_parent_pg_code
  ON public.customers (user_id, parent_pg_code)
  WHERE parent_pg_code IS NOT NULL;
