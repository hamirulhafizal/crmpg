-- Admin manual lead rotation queue order (waiting participants only; cleared each round).

ALTER TABLE public.google_ads_participants
  ADD COLUMN IF NOT EXISTS rotation_queue_order INTEGER,
  ADD COLUMN IF NOT EXISTS rotation_queue_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rotation_queue_updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.google_ads_participants.rotation_queue_order IS
  'Admin override sort order for active rotation pool. NULL = payment-date order. Cleared when round resets.';
COMMENT ON COLUMN public.google_ads_participants.rotation_queue_updated_at IS
  'When admin last changed rotation_queue_order.';
COMMENT ON COLUMN public.google_ads_participants.rotation_queue_updated_by IS
  'Admin user who last changed rotation_queue_order.';

CREATE INDEX IF NOT EXISTS idx_google_ads_participants_rotation_queue_order
  ON public.google_ads_participants (rotation_queue_order)
  WHERE rotation_queue_order IS NOT NULL;
