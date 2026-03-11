-- Stores concrete scheduled WhatsApp messages to be processed by cron.
-- Each row represents a single outgoing message instance.

CREATE TABLE IF NOT EXISTS scheduled_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,

  phone TEXT NOT NULL, -- target phone number (raw, e.g. 60123456789)
  message TEXT NOT NULL, -- message template; variables are resolved right before sending
  scheduled_at TIMESTAMPTZ NOT NULL,

  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')) DEFAULT 'pending',
  locked_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Optimise lookups for the cron worker
CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status_scheduled_at
  ON scheduled_messages (status, scheduled_at);

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_user_id
  ON scheduled_messages (user_id);

-- Enable RLS so users see only their own messages.
ALTER TABLE scheduled_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own scheduled messages"
  ON scheduled_messages FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own scheduled messages"
  ON scheduled_messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Cron / server code will use the service role key, so no extra UPDATE/DELETE
-- policies are necessary for end users.

