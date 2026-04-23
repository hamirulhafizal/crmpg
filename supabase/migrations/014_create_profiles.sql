-- public.profiles: app-facing row per auth user (extends auth.users).
-- Suggested columns rationale:
--   role              — app authorization (admin/user/…); not user-editable via API (column privilege).
--   waha_server_id    — which WAHA instance this account uses (nullable → fall back to default server / env).
--   full_name         — display name (can sync from OAuth metadata on signup).
--   avatar_url        — optional profile image URL.
--   timezone / locale — useful later for scheduling & formatting (nullable until you need them).
--   metadata          — flexible JSON for preferences without new migrations.

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role = ANY (ARRAY['user'::text, 'admin'::text])),
  waha_server_id UUID DEFAULT 'eff01293-4421-4ed2-be7f-f28a7be2cb72'::uuid
    REFERENCES public.waha_servers (id) ON DELETE SET NULL,
  timezone TEXT,
  locale TEXT DEFAULT 'en',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_waha_server_id ON public.profiles (waha_server_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles (role);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.profiles IS 'One row per auth user; role and WAHA routing for server-side logic.';
COMMENT ON COLUMN public.profiles.role IS 'Authorization label for app (admin tooling, RLS helpers). Updated via service role or SQL, not PostgREST users.';
COMMENT ON COLUMN public.profiles.waha_server_id IS 'Preferred WAHA server; defaults to primary WAHA instance eff01293-4421-4ed2-be7f-f28a7be2cb72.';
COMMENT ON COLUMN public.profiles.metadata IS 'Optional JSON flags (theme, onboarding, feature toggles).';

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile safe columns"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Client roles cannot insert rows (signup uses SECURITY DEFINER trigger as DB owner).
REVOKE INSERT ON public.profiles FROM anon, authenticated;

-- Authenticated clients may not change role via PostgREST (admins use service_role or SQL).
REVOKE UPDATE (role) ON public.profiles FROM authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, avatar_url, waha_server_id, timezone, locale, metadata)
  ON public.profiles TO authenticated;

GRANT ALL ON public.profiles TO service_role;

-- ---------------------------------------------------------------------------
-- New signups → profile row
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.raw_user_meta_data ->> 'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS 'Creates public.profiles when auth.users gains a row.';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Existing users (created before this migration)
-- ---------------------------------------------------------------------------
INSERT INTO public.profiles (id)
SELECT u.id
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles AS p WHERE p.id = u.id
);
