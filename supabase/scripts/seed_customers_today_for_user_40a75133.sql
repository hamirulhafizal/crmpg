-- Seed 4 demo customers for user_id 40a75133-1895-49da-bbc0-f548780ff851.
-- All rows use dob = CURRENT_DATE and default phone 60184644305.
-- Safe to run multiple times (idempotent by user_id + email).

INSERT INTO public.customers (
  user_id,
  name,
  dob,
  email,
  phone,
  location,
  gender,
  ethnicity,
  age,
  prefix,
  first_name,
  sender_name,
  save_name,
  pg_code,
  original_data
)
SELECT
  seed.user_id,
  seed.name,
  CURRENT_DATE,
  seed.email,
  '60184644305',
  seed.location,
  seed.gender,
  seed.ethnicity,
  seed.age,
  seed.prefix,
  seed.first_name,
  seed.sender_name,
  seed.save_name,
  seed.pg_code,
  seed.original_data
FROM (
  VALUES
    (
      '40a75133-1895-49da-bbc0-f548780ff851'::uuid,
      'Aisyah Rahman',
      'aisyah.rahman.seed+1@example.com',
      'Kuala Lumpur',
      'Female',
      'Malay',
      31,
      'Pn',
      'Aisyah',
      'Team PG',
      'Aisyah (Seed)',
      'PG-KL-001',
      jsonb_build_object('source', 'seed', 'note', 'birthday_today')
    ),
    (
      '40a75133-1895-49da-bbc0-f548780ff851'::uuid,
      'Wei Jian Lim',
      'weijian.lim.seed+2@example.com',
      'Petaling Jaya',
      'Male',
      'Chinese',
      29,
      'Tn',
      'Wei Jian',
      'Team PG',
      'Wei Jian (Seed)',
      'PG-PJ-002',
      jsonb_build_object('source', 'seed', 'note', 'birthday_today')
    ),
    (
      '40a75133-1895-49da-bbc0-f548780ff851'::uuid,
      'Kavitha Nair',
      'kavitha.nair.seed+3@example.com',
      'Shah Alam',
      'Female',
      'Indian',
      34,
      'Cik',
      'Kavitha',
      'Team PG',
      'Kavitha (Seed)',
      'PG-SA-003',
      jsonb_build_object('source', 'seed', 'note', 'birthday_today')
    ),
    (
      '40a75133-1895-49da-bbc0-f548780ff851'::uuid,
      'Alex Tan',
      'alex.tan.seed+4@example.com',
      'Subang Jaya',
      'Male',
      'Other',
      27,
      'En',
      'Alex',
      'Team PG',
      'Alex (Seed)',
      'PG-SJ-004',
      jsonb_build_object('source', 'seed', 'note', 'birthday_today')
    )
) AS seed(
  user_id,
  name,
  email,
  location,
  gender,
  ethnicity,
  age,
  prefix,
  first_name,
  sender_name,
  save_name,
  pg_code,
  original_data
)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.customers c
  WHERE c.user_id = seed.user_id
    AND c.email = seed.email
);

-- Optional verification:
-- SELECT id, name, dob, phone, email
-- FROM public.customers
-- WHERE user_id = '40a75133-1895-49da-bbc0-f548780ff851'
--   AND dob = CURRENT_DATE
-- ORDER BY created_at DESC;
