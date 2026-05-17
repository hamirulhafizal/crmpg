-- Seed 20 customers for user 40a75133-1895-49da-bbc0-f548780ff851 (WAHA session phones).
-- Random names, dob = CURRENT_DATE, one random CRM tag each from public.tags.
-- Idempotent: removes prior rows with pg_code prefix WAHA-SEED- for this user before insert.
--
-- Run in Supabase SQL editor (service role / postgres) or: psql ... -f this file

DO $$
DECLARE
  v_user CONSTANT uuid := '40a75133-1895-49da-bbc0-f548780ff851'::uuid;
  phones text[] := ARRAY[
    '60105439002',
    '60122748785',
    '601116373948',
    '60176576687',
    '60177951794',
    '60125454230',
    '60123428265',
    '60135857011',
    '601113165901',
    '60145372892',
    '60184644305',
    '60122120534',
    '60196436959',
    '601110122610',
    '60132792281',
    '601156747399',
    '60177187938',
    '60133107096',
    '60182164706',
    '60182321262'
  ];
  first_names text[] := ARRAY[
    'Ahmad', 'Siti', 'Wei Jian', 'Kavitha', 'Hafiz', 'Nurul', 'Raj', 'Lim',
    'Fatimah', 'Daniel', 'Aisyah', 'Kumar', 'Mei Ling', 'Irfan', 'Priya', 'Omar',
    'Yasmin', 'Jason', 'Deepa', 'Hakim'
  ];
  last_names text[] := ARRAY[
    'Rahman', 'Abdullah', 'Tan', 'Nair', 'Lim', 'Hassan', 'Wong', 'Ismail',
    'Singh', 'Lee', 'Ahmad', 'Chan', 'Muthu', 'Yusof', 'Ng', 'Zainal',
    'Subramaniam', 'Ong', 'Khalid', 'Rosli'
  ];
  locations text[] := ARRAY[
    'Kuala Lumpur', 'Petaling Jaya', 'Shah Alam', 'Subang Jaya', 'Klang',
    'Johor Bahru', 'Penang', 'Ipoh', 'Melaka', 'Seremban'
  ];
  ethnicities text[] := ARRAY['Malay', 'Chinese', 'Indian', 'Other'];
  i integer;
  n integer;
  v_phone text;
  v_customer_id uuid;
  v_tag_id uuid;
  v_first text;
  v_last text;
  v_name text;
  v_gender text;
  v_ethnicity text;
  v_prefix text;
  v_location text;
  tag_count integer;
BEGIN
  n := array_length(phones, 1);
  IF n IS NULL OR n = 0 THEN
    RAISE EXCEPTION 'phones array is empty';
  END IF;

  SELECT COUNT(*)::integer INTO tag_count FROM public.tags;
  IF tag_count = 0 THEN
    RAISE EXCEPTION 'public.tags is empty; apply tag migrations (019/020) before this seed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    RAISE NOTICE 'Seed skipped: no auth.users row for %.', v_user;
    RETURN;
  END IF;

  DELETE FROM public.customer_tags ct
  USING public.customers c
  WHERE ct.customer_id = c.id
    AND c.user_id = v_user
    AND c.pg_code IS NOT NULL
    AND btrim(c.pg_code) LIKE 'WAHA-SEED-%';

  DELETE FROM public.customers
  WHERE user_id = v_user
    AND pg_code IS NOT NULL
    AND btrim(pg_code) LIKE 'WAHA-SEED-%';

  FOR i IN 1..n LOOP
    v_phone := phones[i];
    v_first := first_names[1 + floor(random() * array_length(first_names, 1))::integer];
    v_last := last_names[1 + floor(random() * array_length(last_names, 1))::integer];
    v_name := v_first || ' ' || v_last;
    v_gender := CASE WHEN random() < 0.5 THEN 'Male' ELSE 'Female' END;
    v_ethnicity := ethnicities[1 + floor(random() * array_length(ethnicities, 1))::integer];
    v_prefix := CASE
      WHEN v_gender = 'Male' AND v_ethnicity = 'Malay' THEN 'En'
      WHEN v_gender = 'Female' AND v_ethnicity = 'Malay' THEN 'Pn'
      WHEN v_gender = 'Female' THEN 'Cik'
      ELSE 'Tn'
    END;
    v_location := locations[1 + floor(random() * array_length(locations, 1))::integer];

    INSERT INTO public.customers (
      user_id,
      name,
      dob,
      phone,
      email,
      first_name,
      save_name,
      sender_name,
      gender,
      ethnicity,
      age,
      prefix,
      location,
      pg_code,
      original_data,
      last_purchase_at,
      is_monthly_buyer,
      segment_attributes
    )
    VALUES (
      v_user,
      v_name,
      CURRENT_DATE,
      v_phone,
      'waha.seed.' || i || '.' || v_phone || '@invalid.local',
      v_first,
      v_name,
      v_name,
      v_gender,
      v_ethnicity,
      18 + floor(random() * 40)::integer,
      v_prefix,
      v_location,
      'WAHA-SEED-' || lpad(i::text, 3, '0'),
      jsonb_build_object(
        'Phone', v_phone,
        'PG Code', 'WAHA-SEED-' || lpad(i::text, 3, '0'),
        'session_name', v_phone,
        'source', 'waha_session_seed',
        'Date Register', to_char(CURRENT_DATE, 'YYYY-MM-DD')
      ),
      NOW() - (i * 17) * interval '1 day',
      false,
      '{}'::jsonb
    )
    RETURNING id INTO v_customer_id;

    SELECT t.id
    INTO v_tag_id
    FROM public.tags t
    ORDER BY random()
    LIMIT 1;

    INSERT INTO public.customer_tags (customer_id, tag_id, user_id, source)
    VALUES (v_customer_id, v_tag_id, v_user, 'import');
  END LOOP;

  RAISE NOTICE 'Seeded % WAHA session customers (dob=today) for user %.', n, v_user;
END
$$;

-- Verification:
-- SELECT c.name, c.dob, c.phone, c.pg_code, t.label AS tag
-- FROM public.customers c
-- LEFT JOIN public.customer_tags ct ON ct.customer_id = c.id
-- LEFT JOIN public.tags t ON t.id = ct.tag_id
-- WHERE c.user_id = '40a75133-1895-49da-bbc0-f548780ff851'
--   AND c.pg_code LIKE 'WAHA-SEED-%'
-- ORDER BY c.pg_code;
