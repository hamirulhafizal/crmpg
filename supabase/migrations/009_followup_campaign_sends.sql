-- One-time follow-up sends per customer per campaign kind (inactive / free account).
CREATE TABLE IF NOT EXISTS followup_campaign_sends (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('inactive', 'free')),
  scheduled_message_id UUID REFERENCES public.scheduled_messages (id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, customer_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_followup_campaign_sends_user_kind
  ON followup_campaign_sends (user_id, kind);

ALTER TABLE followup_campaign_sends ENABLE ROW LEVEL SECURITY;
