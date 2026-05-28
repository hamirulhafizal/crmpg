-- Lucky draw: dealer-owned public pages, custom questions, customer entries.

CREATE TABLE IF NOT EXISTS public.lucky_draw_dealer_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  dealer_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lucky_draw_dealer_slug_format CHECK (dealer_slug ~ '^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$' OR dealer_slug ~ '^[a-z0-9]{2,4}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS lucky_draw_dealer_slug_unique ON public.lucky_draw_dealer_settings (dealer_slug);

CREATE TABLE IF NOT EXISTS public.lucky_draw_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  page_slug TEXT NOT NULL DEFAULT 'lucky-draw',
  title TEXT NOT NULL DEFAULT 'Lucky Draw',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'closed')),
  prizes JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_and_conditions TEXT,
  target_audience TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT lucky_draw_page_slug_format CHECK (page_slug ~ '^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$' OR page_slug ~ '^[a-z0-9]{1,2}$'),
  UNIQUE (user_id, page_slug)
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_pages_user_id ON public.lucky_draw_pages (user_id);
CREATE INDEX IF NOT EXISTS idx_lucky_draw_pages_status ON public.lucky_draw_pages (status);

CREATE TABLE IF NOT EXISTS public.lucky_draw_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.lucky_draw_pages (id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  question_type TEXT NOT NULL
    CHECK (question_type IN ('text', 'multiple_choice', 'yes_no', 'tag_picker')),
  question_text TEXT NOT NULL,
  options JSONB,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_questions_page_id ON public.lucky_draw_questions (page_id, sort_order);

CREATE TABLE IF NOT EXISTS public.lucky_draw_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES public.lucky_draw_pages (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  purpose_tag_ids UUID[] NOT NULL DEFAULT '{}',
  location_text TEXT,
  location_lat DOUBLE PRECISION,
  location_lng DOUBLE PRECISION,
  participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (page_id, customer_id)
);

CREATE INDEX IF NOT EXISTS idx_lucky_draw_entries_page_id ON public.lucky_draw_entries (page_id);
CREATE INDEX IF NOT EXISTS idx_lucky_draw_entries_user_id ON public.lucky_draw_entries (user_id);

CREATE TRIGGER update_lucky_draw_dealer_settings_updated_at
  BEFORE UPDATE ON public.lucky_draw_dealer_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

CREATE TRIGGER update_lucky_draw_pages_updated_at
  BEFORE UPDATE ON public.lucky_draw_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column ();

-- Extend customer_tags.source for lucky draw entries
ALTER TABLE public.customer_tags DROP CONSTRAINT IF EXISTS customer_tags_source_check;
ALTER TABLE public.customer_tags ADD CONSTRAINT customer_tags_source_check
  CHECK (source IN ('manual', 'rule', 'import', 'ai', 'lucky_draw'));

ALTER TABLE public.lucky_draw_dealer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_draw_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_draw_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lucky_draw_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lucky_draw_dealer_settings_own" ON public.lucky_draw_dealer_settings FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lucky_draw_pages_own" ON public.lucky_draw_pages FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "lucky_draw_questions_own" ON public.lucky_draw_questions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.lucky_draw_pages p
      WHERE p.id = lucky_draw_questions.page_id AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.lucky_draw_pages p
      WHERE p.id = lucky_draw_questions.page_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "lucky_draw_entries_select_own" ON public.lucky_draw_entries FOR SELECT TO authenticated
  USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lucky_draw_dealer_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lucky_draw_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lucky_draw_questions TO authenticated;
GRANT SELECT ON public.lucky_draw_entries TO authenticated;

COMMENT ON TABLE public.lucky_draw_pages IS 'Dealer-owned lucky draw landing pages at /{dealer_slug}/{page_slug}.';
COMMENT ON COLUMN public.lucky_draw_pages.prizes IS 'JSON array: [{ "name": string, "description"?: string }]';
