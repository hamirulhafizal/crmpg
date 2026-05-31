-- Platform-wide lucky draw template: auto-provisioned for dealers, editable by admin.

ALTER TABLE public.lucky_draw_pages
  ADD COLUMN IF NOT EXISTS uses_platform_defaults BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.lucky_draw_platform_defaults (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  title TEXT NOT NULL DEFAULT 'Lucky Draw',
  page_slug TEXT NOT NULL DEFAULT 'lucky-draw',
  prizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_and_conditions TEXT,
  target_audience TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lucky_draw_platform_default_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  question_type TEXT NOT NULL
    CHECK (question_type IN ('text', 'multiple_choice', 'yes_no', 'tag_picker')),
  question_text TEXT NOT NULL,
  options JSONB,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_platform_default_questions_sort
  ON public.lucky_draw_platform_default_questions (sort_order);

CREATE TRIGGER update_lucky_draw_platform_defaults_updated_at
  BEFORE UPDATE ON public.lucky_draw_platform_defaults
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

ALTER TABLE public.lucky_draw_platform_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_draw_platform_default_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lucky_draw_platform_defaults_select_authenticated"
  ON public.lucky_draw_platform_defaults FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lucky_draw_platform_default_questions_select_authenticated"
  ON public.lucky_draw_platform_default_questions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "lucky_draw_platform_defaults_admin_all"
  ON public.lucky_draw_platform_defaults FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "lucky_draw_platform_default_questions_admin_all"
  ON public.lucky_draw_platform_default_questions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

GRANT SELECT ON public.lucky_draw_platform_defaults TO authenticated;
GRANT SELECT ON public.lucky_draw_platform_default_questions TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lucky_draw_platform_defaults TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.lucky_draw_platform_default_questions TO authenticated;

INSERT INTO public.lucky_draw_platform_defaults (
  id,
  title,
  page_slug,
  prizes,
  terms_and_conditions,
  target_audience
) VALUES (
  'default',
  'Lucky Draw',
  'lucky-draw',
  '[
    {"name": "5GRAM", "description": "Gold Bar 999 (bernilai RM10K)"},
    {"name": "1GRAM", "description": "Gold Bar 999"}
  ]'::jsonb,
  E'1. Aktif Menabung Setiap bulan\n2. Profile sudah verified\n3. Subscribe Auto Debit GAP 5 tahun',
  NULL
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.lucky_draw_platform_default_questions
  (sort_order, question_type, question_text, is_required)
SELECT v.sort_order, v.question_type, v.question_text, TRUE
FROM (
  VALUES
    (0, 'yes_no', 'Pernah Hadir Seminar Kaya Dengan Emas ?'),
    (1, 'yes_no', 'Pernah Withdraw Emas 999 GAP di ATM ?'),
    (2, 'yes_no', 'Dah Install APPS Public Gold ?'),
    (3, 'yes_no', 'Pernah Pajak Emas GAP ?'),
    (4, 'yes_no', 'Pernah Buat Buyback (jual emas) GAP ?'),
    (5, 'yes_no', 'Pernah Join Private Webinar ?'),
    (6, 'yes_no', 'Pernah Withdraw Barang Kemas 999 GAP di branch ?')
) AS v(sort_order, question_type, question_text)
WHERE NOT EXISTS (SELECT 1 FROM public.lucky_draw_platform_default_questions LIMIT 1);

COMMENT ON TABLE public.lucky_draw_platform_defaults IS 'Singleton template for dealer lucky draw pages.';
COMMENT ON COLUMN public.lucky_draw_pages.uses_platform_defaults IS 'When true, admin platform updates sync to this page until the dealer saves custom edits.';
