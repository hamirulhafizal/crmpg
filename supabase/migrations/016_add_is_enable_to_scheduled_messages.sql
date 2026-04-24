-- Ensure scheduled_messages has an enable/disable flag used by automation workers.
-- Some environments are missing this column, causing fallback warnings at runtime.

ALTER TABLE public.scheduled_messages
ADD COLUMN IF NOT EXISTS is_enable BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_is_enable
  ON public.scheduled_messages (is_enable);
