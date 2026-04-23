-- Fill public.profiles for every auth.users row that does not have one yet.
-- Safe to run multiple times (only inserts missing rows).
-- Run in Supabase SQL Editor as postgres / dashboard (not via anon key).

INSERT INTO public.profiles (id, full_name, avatar_url)
SELECT
  u.id,
  NULLIF(
    TRIM(
      COALESCE(
        u.raw_user_meta_data ->> 'full_name',
        u.raw_user_meta_data ->> 'name',
        u.raw_user_meta_data ->> 'display_name'
      )
    ),
    ''
  ),
  NULLIF(TRIM(u.raw_user_meta_data ->> 'avatar_url'), '')
FROM auth.users AS u
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles AS p WHERE p.id = u.id
);

-- Optional: see how many rows exist vs auth users
-- SELECT (SELECT COUNT(*) FROM auth.users) AS auth_users,
--        (SELECT COUNT(*) FROM public.profiles) AS profiles;
