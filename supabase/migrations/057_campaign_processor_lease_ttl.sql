-- Shorter lease + steal stale locks when Vercel kills a run before release (maxDuration ~300s).

CREATE OR REPLACE FUNCTION public.try_campaign_processor_lock(
  p_holder TEXT DEFAULT NULL,
  p_lease_seconds INT DEFAULT 360
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_seconds INT := GREATEST(120, LEAST(COALESCE(p_lease_seconds, 360), 600));
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
    AND (
      expires_at IS NULL
      OR expires_at <= v_now
    );

  RETURN FOUND;
END;
$$;

-- Clear any lock left by a crashed/timed-out processor run.
UPDATE public.campaign_processor_lease
SET holder = NULL, expires_at = NULL, updated_at = NOW()
WHERE id = 1;
