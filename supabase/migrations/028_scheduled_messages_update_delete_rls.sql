-- Allow authenticated users to update/delete their own scheduled messages.
-- Existing table already has SELECT/INSERT policies from migration 006.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_messages'
      AND policyname = 'Users can update own scheduled messages'
  ) THEN
    CREATE POLICY "Users can update own scheduled messages"
      ON public.scheduled_messages
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'scheduled_messages'
      AND policyname = 'Users can delete own scheduled messages'
  ) THEN
    CREATE POLICY "Users can delete own scheduled messages"
      ON public.scheduled_messages
      FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END
$$;
