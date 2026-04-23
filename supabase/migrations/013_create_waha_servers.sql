-- Multiple WAHA API endpoints (per-server base URL + API key).
-- RLS is enabled with no policies for anon/authenticated so keys are never exposed via the Data API.
-- Manage rows with the service role from trusted server code, or via the Supabase SQL editor / Dashboard.

CREATE TABLE IF NOT EXISTS waha_servers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  api_base_url TEXT NOT NULL,
  api_key TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT waha_servers_name_nonempty CHECK (length(trim(name)) > 0),
  CONSTRAINT waha_servers_url_nonempty CHECK (length(trim(api_base_url)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS waha_servers_name_unique
  ON waha_servers (lower(trim(name)));

-- At most one row may be marked default (when none is default, callers can fall back to env vars).
CREATE UNIQUE INDEX IF NOT EXISTS waha_servers_one_default
  ON waha_servers (is_default)
  WHERE is_default;

CREATE TRIGGER update_waha_servers_updated_at
  BEFORE UPDATE ON waha_servers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE waha_servers IS 'Registry of WAHA instances (api_base_url + api_key). Server-side / service_role access only.';
COMMENT ON COLUMN waha_servers.name IS 'Human-readable label for admin UI.';
COMMENT ON COLUMN waha_servers.api_base_url IS 'WAHA origin without trailing slash (same role as WAHA_API_BASE_URL).';
COMMENT ON COLUMN waha_servers.api_key IS 'Value sent as X-Api-Key (same role as WAHA_API_KEY).';
COMMENT ON COLUMN waha_servers.is_default IS 'Optional single default server when resolving which WAHA instance to use.';

ALTER TABLE waha_servers ENABLE ROW LEVEL SECURITY;
