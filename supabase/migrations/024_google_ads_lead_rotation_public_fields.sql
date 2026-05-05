-- Lead rotation + public listing fields for Google Ads participants (replaces NocoDB dealers sheet).

ALTER TABLE public.google_ads_participants
  ADD COLUMN IF NOT EXISTS lead_email BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pg_code TEXT,
  ADD COLUMN IF NOT EXISTS public_username TEXT;

COMMENT ON COLUMN public.google_ads_participants.lead_email IS
  'Round-robin: TRUE after this dealer received a lead in the current cycle (legacy NocoDB lead_email semantics).';
COMMENT ON COLUMN public.google_ads_participants.pg_code IS
  'PG Code shown on public landing agent grid.';
COMMENT ON COLUMN public.google_ads_participants.public_username IS
  'Public dealer label / Username PGO (also Public Gold page slug when used with page-1).';

-- Single-row cursor for fair rotation on legacy page-1 / getDealerData (replaces NocoDB redirect index).
CREATE TABLE IF NOT EXISTS public.app_dealer_rotation (
  id TEXT PRIMARY KEY,
  current_index INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.app_dealer_rotation (id, current_index)
VALUES ('public_gold_content', 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_dealer_rotation ENABLE ROW LEVEL SECURITY;

-- No client access; server uses service role only.
REVOKE ALL ON public.app_dealer_rotation FROM PUBLIC;
GRANT ALL ON public.app_dealer_rotation TO service_role;
