-- Expose whether the current user has a password (OAuth-only users typically have NULL encrypted_password).
-- Called via PostgREST: rpc('user_has_password').

CREATE OR REPLACE FUNCTION public.user_has_password()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(
    (
      SELECT u.encrypted_password IS NOT NULL
        AND length(btrim(u.encrypted_password::text)) > 0
      FROM auth.users u
      WHERE u.id = auth.uid()
    ),
    false
  );
$$;

COMMENT ON FUNCTION public.user_has_password() IS 'True if the current user has a password set on auth.users (email/password or after updateUser).';

REVOKE ALL ON FUNCTION public.user_has_password() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_password() TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_password() TO service_role;
