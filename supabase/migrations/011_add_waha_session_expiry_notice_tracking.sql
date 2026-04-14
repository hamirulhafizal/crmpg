-- Track WAHA session status and expiry notice timestamps to avoid duplicate
-- "session expired" notification emails across repeated cron invocations.
ALTER TABLE waha_user_sessions
ADD COLUMN IF NOT EXISTS last_known_waha_status TEXT,
ADD COLUMN IF NOT EXISTS session_expired_notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_waha_user_sessions_expired_notice_at
  ON waha_user_sessions(session_expired_notified_at);
