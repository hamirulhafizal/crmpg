-- Add per-user Gmail app password for WAHA fallback
ALTER TABLE waha_user_sessions
ADD COLUMN IF NOT EXISTS gmaill_app_password TEXT;

-- Allow users to update their own WAHA session rows (needed to save app password)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'waha_user_sessions'
      AND policyname = 'Users can update their own WAHA sessions'
  ) THEN
    CREATE POLICY "Users can update their own WAHA sessions"
      ON waha_user_sessions
      FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

