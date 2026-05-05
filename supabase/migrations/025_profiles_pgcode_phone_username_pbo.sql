-- Dealer-facing identity on profiles (sync from legacy dealers export / NocoDB).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pgcode TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS username_pbo TEXT;

COMMENT ON COLUMN public.profiles.pgcode IS 'Public Gold dealer code (e.g. PG00104897).';
COMMENT ON COLUMN public.profiles.phone IS 'Dealer MSISDN digits (e.g. 60184644305), not WhatsApp deep link.';
COMMENT ON COLUMN public.profiles.username_pbo IS 'Display label / Username PGO from dealer export.';

-- Allow authenticated users to update these on their own row (same pattern as avatar_url).
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name,
  avatar_url,
  waha_server_id,
  timezone,
  locale,
  metadata,
  pgcode,
  phone,
  username_pbo
)
  ON public.profiles TO authenticated;
