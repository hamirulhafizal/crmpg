-- Idempotent seed: 10 test customers for campaign QA.
-- Same phone 60184644305, DOB = CURRENT_DATE (server date), one random CRM tag each from public.tags.
-- Removes prior seed rows (pg_code prefix CAMPAIGN-SEED-) for the same user before insert.

DO $$
DECLARE
  v_user CONSTANT uuid := '40a75133-1895-49da-bbc0-f548780ff851'::uuid;
  i integer;
  v_customer_id uuid;
  v_tag_id uuid;
  tag_count integer;
BEGIN
  SELECT COUNT(*)::integer INTO tag_count FROM public.tags;
  IF tag_count = 0 THEN
    RAISE EXCEPTION 'public.tags is empty; apply tag migrations (019/020) before this seed.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user) THEN
    RAISE NOTICE 'Seed skipped: no auth.users row for %.', v_user;
    RETURN;
  END IF;

  DELETE FROM public.customers
  WHERE user_id = v_user
    AND pg_code IS NOT NULL
    AND btrim(pg_code) LIKE 'CAMPAIGN-SEED-%';

  FOR i IN 1..10 LOOP
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
      location,
      pg_code,
      original_data,
      last_purchase_at,
      is_monthly_buyer
    )
    VALUES (
      v_user,
      'Campaign Seed ' || i,
      CURRENT_DATE,
      '60184644305',
      'campaign.seed.' || i || '.test@invalid.local',
      'Seed' || i,
      'Seed ' || i,
      'Seed Tester ' || i,
      CASE WHEN i % 2 = 0 THEN 'Male' ELSE 'Female' END,
      'Selangor',
      'CAMPAIGN-SEED-' || lpad(i::text, 3, '0'),
      jsonb_build_object(
        'Phone', '60184644305',
        'PG Code', 'CAMPAIGN-SEED-' || lpad(i::text, 3, '0'),
        'Date Register', to_char(CURRENT_DATE - i, 'YYYY-MM-DD')
      ),
      NOW() - (i * 35) * interval '1 day',
      false
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

  RAISE NOTICE 'Seeded 10 campaign test customers for user %.', v_user;
END
$$;
