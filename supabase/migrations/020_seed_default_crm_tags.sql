-- Default CRM tags (Public Gold–style mockup). Safe to re-run: skips existing (category_id, slug).

INSERT INTO public.tags (category_id, slug, label, sort_order, metadata)
SELECT c.id, v.slug, v.label, v.sort_order, v.metadata::jsonb
FROM public.tag_categories c
JOIN (
  VALUES
    -- 1. Lifecycle
    (
      'lifecycle',
      'prospect',
      'Prospect (belum beli)',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'lifecycle',
      'first_time_buyer',
      'First Time Buyer',
      20,
      '{"seed":"default_v1","automation_hint":"educate_gold_storage"}'
    ),
    (
      'lifecycle',
      'active_buyer',
      'Active Buyer (repeat beli emas)',
      30,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'lifecycle',
      'inactive',
      'Inactive (lama tak beli)',
      40,
      '{"seed":"default_v1","automation_hint":"whatsapp_reminder"}'
    ),
    (
      'lifecycle',
      'lost_customer',
      'Lost Customer',
      50,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'lifecycle',
      'vip_customer',
      'VIP Customer (high volume)',
      60,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 2. Behavior (gold purchase)
    (
      'behavior_buy',
      'consistent_saver',
      'Consistent Saver (beli setiap bulan)',
      10,
      '{"seed":"default_v1","automation_hint":"gap_auto_debit"}'
    ),
    (
      'behavior_buy',
      'bulk_buyer',
      'Bulk Buyer (beli lump sum)',
      20,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'behavior_buy',
      'price_sensitive',
      'Price Sensitive (tunggu harga turun)',
      30,
      '{"seed":"default_v1","automation_hint":"gold_price_alert"}'
    ),
    (
      'behavior_buy',
      'emotional_buyer',
      'Emotional Buyer (trend / FOMO)',
      40,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'behavior_buy',
      'hibah_planner',
      'Hibah Planner (pewarisan)',
      50,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 3. Product interest
    (
      'product_interest',
      'gold_bar',
      'Gold Bar',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'product_interest',
      'gold_dinar',
      'Gold Dinar',
      20,
      '{"seed":"default_v1","automation_hint":"long_term_saving_nudge"}'
    ),
    (
      'product_interest',
      'silver',
      'Silver',
      30,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'product_interest',
      'gap_account',
      'GAP Account',
      40,
      '{"seed":"default_v1","automation_hint":"consistent_saving_education"}'
    ),
    (
      'product_interest',
      'epp',
      'EPP (Easy Payment Plan)',
      50,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 4. Value tier
    (
      'value_tier',
      'low_value',
      'Low Value (< RM1k)',
      10,
      '{"seed":"default_v1","band_rm":{"max":1000}}'
    ),
    (
      'value_tier',
      'medium_value',
      'Medium Value (RM1k–RM10k)',
      20,
      '{"seed":"default_v1","band_rm":{"min":1000,"max":10000}}'
    ),
    (
      'value_tier',
      'high_value',
      'High Value (> RM10k)',
      30,
      '{"seed":"default_v1","band_rm":{"min":10000,"max":50000}}'
    ),
    (
      'value_tier',
      'whale',
      'Whale (> RM50k)',
      40,
      '{"seed":"default_v1","band_rm":{"min":50000}}'
    ),

    -- 5. Goals
    (
      'goal',
      'wedding_savings',
      'Simpanan Kahwin',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'goal',
      'emergency_fund',
      'Dana Kecemasan',
      20,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'goal',
      'child_savings',
      'Simpanan Anak',
      30,
      '{"seed":"default_v1","automation_hint":"education_fund_content"}'
    ),
    (
      'goal',
      'retirement',
      'Persaraan',
      40,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'goal',
      'hajj_umrah',
      'Haji / Umrah',
      50,
      '{"seed":"default_v1","automation_hint":"hajj_inflation_gold_content"}'
    ),
    (
      'goal',
      'investment_growth',
      'Investment / Wealth Growth',
      60,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 6. Engagement
    (
      'engagement',
      'hot_lead',
      'Hot Lead',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'engagement',
      'warm_lead',
      'Warm Lead',
      20,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'engagement',
      'cold_lead',
      'Cold Lead',
      30,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'engagement',
      'responded',
      'Responded',
      40,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'engagement',
      'no_response',
      'No Response',
      50,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'engagement',
      'followup_needed',
      'Follow-up Needed',
      60,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 7. Network / referral
    (
      'network',
      'referral_customer',
      'Referral Customer',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'network',
      'repeat_referral',
      'Repeat Referral',
      20,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'network',
      'potential_agent',
      'Potential Agent',
      30,
      '{"seed":"default_v1","automation_hint":"recruit_dealer"}'
    ),
    (
      'network',
      'downline_prospect',
      'Downline Prospect',
      40,
      '{"seed":"default_v1","automation_hint":null}'
    ),

    -- 8. Location (Malaysia — extend anytime)
    ('location', 'kl', 'KL', 10, '{"seed":"default_v1","region":"central"}'),
    ('location', 'selangor', 'Selangor', 20, '{"seed":"default_v1","region":"central"}'),
    ('location', 'johor', 'Johor', 30, '{"seed":"default_v1","region":"southern"}'),
    ('location', 'penang', 'Penang', 40, '{"seed":"default_v1","region":"northern"}'),
    ('location', 'perak', 'Perak', 50, '{"seed":"default_v1","region":"northern"}'),
    ('location', 'kedah', 'Kedah', 60, '{"seed":"default_v1","region":"northern"}'),
    ('location', 'melaka', 'Melaka', 70, '{"seed":"default_v1","region":"southern"}'),
    ('location', 'negeri_sembilan', 'Negeri Sembilan', 80, '{"seed":"default_v1","region":"central"}'),
    ('location', 'pahang', 'Pahang', 90, '{"seed":"default_v1","region":"east_coast"}'),
    ('location', 'terengganu', 'Terengganu', 100, '{"seed":"default_v1","region":"east_coast"}'),
    ('location', 'kelantan', 'Kelantan', 110, '{"seed":"default_v1","region":"east_coast"}'),
    ('location', 'sabah', 'Sabah', 120, '{"seed":"default_v1","region":"borneo"}'),
    ('location', 'sarawak', 'Sarawak', 130, '{"seed":"default_v1","region":"borneo"}'),
    ('location', 'putrajaya', 'Putrajaya', 140, '{"seed":"default_v1","region":"central"}'),
    ('location', 'labuan', 'Labuan', 150, '{"seed":"default_v1","region":"borneo"}'),

    -- 9. Timing behaviour
    (
      'timing',
      'salary_time_buyer',
      'Salary Time Buyer (awal bulan)',
      10,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'timing',
      'bonus_buyer',
      'Bonus Buyer',
      20,
      '{"seed":"default_v1","automation_hint":null}'
    ),
    (
      'timing',
      'promo_buyer',
      'Promo Buyer',
      30,
      '{"seed":"default_v1","automation_hint":null}'
    )
) AS v (cat_key, slug, label, sort_order, metadata)
  ON c.key = v.cat_key
ON CONFLICT (category_id, slug) DO NOTHING;
