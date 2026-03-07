-- Link app users to WAHA session names so each user only sees their own sessions.
CREATE TABLE IF NOT EXISTS waha_user_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT unique_user_waha_session UNIQUE (user_id, session_name)
);

CREATE INDEX IF NOT EXISTS idx_waha_user_sessions_user_id ON waha_user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_waha_user_sessions_session_name ON waha_user_sessions(session_name);

ALTER TABLE waha_user_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own WAHA sessions"
  ON waha_user_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own WAHA sessions"
  ON waha_user_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own WAHA sessions"
  ON waha_user_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_waha_user_sessions_updated_at
  BEFORE UPDATE ON waha_user_sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
