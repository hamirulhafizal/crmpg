-- Free plan: 3-day signup trial, backfill existing Free subscribers from deploy date.

CREATE OR REPLACE FUNCTION public.ensure_saas_free_subscription(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id UUID;
  v_currency TEXT;
  v_trial_days INTEGER;
  v_trial_end TIMESTAMPTZ;
BEGIN
  SELECT id, currency, trial_days INTO v_plan_id, v_currency, v_trial_days
  FROM public.saas_plans
  WHERE slug = 'free' AND is_active = TRUE
  ORDER BY sort_order
  LIMIT 1;

  IF v_plan_id IS NULL THEN
    RETURN;
  END IF;

  v_trial_days := COALESCE(v_trial_days, 0);
  IF v_trial_days > 0 THEN
    v_trial_end := NOW() + (v_trial_days || ' days')::INTERVAL;
  END IF;

  INSERT INTO public.saas_subscriptions (
    user_id,
    plan_id,
    status,
    locked_price_amount,
    locked_currency,
    current_period_start,
    trial_ends_at,
    current_period_end
  )
  VALUES (
    p_user_id,
    v_plan_id,
    CASE WHEN v_trial_days > 0 THEN 'trialing'::TEXT ELSE 'active'::TEXT END,
    0,
    COALESCE(v_currency, 'MYR'),
    NOW(),
    v_trial_end,
    v_trial_end
  )
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION public.ensure_saas_free_subscription IS
  'Creates Free platform subscription with plan trial_days if user has none.';

-- Existing Free subscribers (active, no trial end): start 3-day trial from today.
UPDATE public.saas_subscriptions s
SET
  status = 'trialing',
  trial_ends_at = NOW() + (GREATEST(COALESCE(p.trial_days, 3), 1) || ' days')::INTERVAL,
  current_period_end = NOW() + (GREATEST(COALESCE(p.trial_days, 3), 1) || ' days')::INTERVAL,
  current_period_start = NOW(),
  updated_at = NOW(),
  payment_metadata = COALESCE(s.payment_metadata, '{}'::jsonb)
    || jsonb_build_object('free_trial_backfill_at', NOW()::text)
FROM public.saas_plans p
WHERE s.plan_id = p.id
  AND p.slug = 'free'
  AND s.status = 'active'
  AND s.trial_ends_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_saas_subscriptions_trial_ends_at
  ON public.saas_subscriptions (trial_ends_at)
  WHERE trial_ends_at IS NOT NULL;
