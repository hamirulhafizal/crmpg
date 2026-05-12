-- Per-customer follow-up activity log (calls, WhatsApp manual/automation) with topic tags
-- for dedupe, cooldowns, and weekly touch quotas (enforced in API).

CREATE TABLE IF NOT EXISTS public.customer_follow_up_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (
    channel IN ('call', 'whatsapp_manual', 'whatsapp_automation')
  ),
  outcome TEXT,
  notes TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  counts_toward_quota BOOLEAN NOT NULL DEFAULT TRUE,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_follow_up_activities_customer_occurred
  ON public.customer_follow_up_activities (customer_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_activities_customer_topic_occurred
  ON public.customer_follow_up_activities (customer_id, topic, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_follow_up_activities_user_id ON public.customer_follow_up_activities (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_follow_up_activities_idempotency_key
  ON public.customer_follow_up_activities (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.customer_follow_up_activities IS 'Dealer follow-up log: topic + channel + outcome; supports quota/cooldown in app.';

CREATE OR REPLACE FUNCTION public.set_follow_up_activity_owner_from_customer ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner UUID;
BEGIN
  SELECT c.user_id INTO owner FROM public.customers c WHERE c.id = NEW.customer_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'customer not found';
  END IF;
  NEW.user_id := owner;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_follow_up_activities_set_user ON public.customer_follow_up_activities;
CREATE TRIGGER trg_follow_up_activities_set_user
  BEFORE INSERT OR UPDATE OF customer_id ON public.customer_follow_up_activities
  FOR EACH ROW
  EXECUTE FUNCTION public.set_follow_up_activity_owner_from_customer ();

ALTER TABLE public.customer_follow_up_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "users_insert_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_delete_own_follow_up_activities"
  ON public.customer_follow_up_activities FOR DELETE TO authenticated
  USING (user_id = auth.uid ());
