-- Replace session-scoped pg advisory locks (broken with Supavisor pool) with a row lease.

CREATE TABLE IF NOT EXISTS public.campaign_processor_lease (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  holder TEXT,
  expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.campaign_processor_lease (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE public.campaign_processor_lease IS
  'Single-row lease for campaign WhatsApp processor; survives connection pooling (replaces pg advisory lock).';

CREATE OR REPLACE FUNCTION public.try_campaign_processor_lock(
  p_holder TEXT DEFAULT NULL,
  p_lease_seconds INT DEFAULT 900
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_seconds INT := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 900), 3600));
  v_holder TEXT := NULLIF(btrim(COALESCE(p_holder, '')), '');
BEGIN
  IF v_holder IS NULL THEN
    v_holder := 'anonymous-' || gen_random_uuid()::text;
  END IF;

  UPDATE public.campaign_processor_lease
  SET
    holder = v_holder,
    expires_at = v_now + make_interval(secs => v_seconds),
    updated_at = v_now
  WHERE id = 1
    AND (expires_at IS NULL OR expires_at <= v_now);

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_campaign_processor_lock(p_holder TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_holder TEXT := NULLIF(btrim(COALESCE(p_holder, '')), '');
BEGIN
  IF v_holder IS NULL THEN
    UPDATE public.campaign_processor_lease
    SET holder = NULL, expires_at = NULL, updated_at = NOW()
    WHERE id = 1;
    RETURN;
  END IF;

  UPDATE public.campaign_processor_lease
  SET holder = NULL, expires_at = NULL, updated_at = NOW()
  WHERE id = 1 AND holder = v_holder;
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_campaign_processor_lock(TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_campaign_processor_lock(TEXT) TO service_role;

-- Clear any stale advisory lock left by the previous implementation.
DO $$
DECLARE
  lock_key BIGINT := hashtext('crmpg_campaign_processor_v1');
  lock_rec RECORD;
BEGIN
  FOR lock_rec IN
    SELECT l.pid
    FROM pg_locks l
    WHERE l.locktype = 'advisory'
      AND l.granted
      AND l.objid = lock_key
  LOOP
    PERFORM pg_terminate_backend(lock_rec.pid);
  END LOOP;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Could not terminate advisory-lock backends (insufficient privilege).';
END;
$$;
