-- Dual WhatsApp providers: WAHA (self-hosted) and WasenderAPI (cloud).
-- Server row holds platform credentials; user session row holds per-dealer session identity.

ALTER TABLE public.waha_servers
  ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'waha'
    CHECK (provider_type = ANY (ARRAY['waha'::text, 'wasender'::text]));

COMMENT ON COLUMN public.waha_servers.provider_type IS
  'WhatsApp integration backend: waha (X-Api-Key) or wasender (Bearer PAT on server row; per-session key on user session).';

-- Mark known Wasender server rows (admin may have added manually).
UPDATE public.waha_servers
SET provider_type = 'wasender'
WHERE lower(trim(api_base_url)) LIKE '%wasenderapi.com%'
  AND provider_type = 'waha';

ALTER TABLE public.waha_user_sessions
  ADD COLUMN IF NOT EXISTS provider_type TEXT NOT NULL DEFAULT 'waha'
    CHECK (provider_type = ANY (ARRAY['waha'::text, 'wasender'::text])),
  ADD COLUMN IF NOT EXISTS external_session_id TEXT,
  ADD COLUMN IF NOT EXISTS session_api_key TEXT;

COMMENT ON COLUMN public.waha_user_sessions.provider_type IS 'Must match assigned server provider when session is active.';
COMMENT ON COLUMN public.waha_user_sessions.external_session_id IS 'Wasender session id (numeric string).';
COMMENT ON COLUMN public.waha_user_sessions.session_api_key IS 'Wasender per-session API key for messaging APIs.';

CREATE INDEX IF NOT EXISTS idx_waha_user_sessions_provider_type
  ON public.waha_user_sessions (provider_type);

CREATE INDEX IF NOT EXISTS idx_waha_servers_provider_type
  ON public.waha_servers (provider_type);
