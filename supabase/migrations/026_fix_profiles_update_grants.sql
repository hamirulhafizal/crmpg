-- Fix profile update permission errors from client-side `/profile` edits.
-- Ensures authenticated users can update safe self-owned columns only.

REVOKE UPDATE ON public.profiles FROM authenticated;

GRANT UPDATE (
  full_name,
  avatar_url,
  waha_server_id,
  timezone,
  locale,
  metadata,
  gmail_app_password,
  gmail_message,
  pgcode,
  phone,
  username_pbo
)
ON public.profiles
TO authenticated;

