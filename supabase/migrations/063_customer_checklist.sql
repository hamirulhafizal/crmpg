-- Customer journey checklist (Kaya Dengan Emas 2026) — progress per customer.
-- Step definitions seeded globally; message templates / workflow send come later.

CREATE TABLE IF NOT EXISTS public.customer_checklist_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  program_slug TEXT NOT NULL DEFAULT 'kaya_emas_2026',
  step_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  title_ms TEXT NOT NULL,
  description TEXT,
  auto_complete_source TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT customer_checklist_steps_program_key UNIQUE (program_slug, step_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_checklist_steps_program_sort
  ON public.customer_checklist_steps (program_slug, sort_order);

COMMENT ON TABLE public.customer_checklist_steps IS
  'Global checklist step definitions (e.g. Kaya Dengan Emas 2026).';

CREATE TABLE IF NOT EXISTS public.customer_checklist_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  program_slug TEXT NOT NULL DEFAULT 'kaya_emas_2026',
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  last_message_sent_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'direct_debit', 'workflow', 'customer', 'system')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW (),
  CONSTRAINT customer_checklist_progress_unique
    UNIQUE (customer_id, program_slug, step_key)
);

CREATE INDEX IF NOT EXISTS idx_customer_checklist_progress_user
  ON public.customer_checklist_progress (user_id, program_slug);

CREATE INDEX IF NOT EXISTS idx_customer_checklist_progress_customer
  ON public.customer_checklist_progress (customer_id, program_slug);

CREATE INDEX IF NOT EXISTS idx_customer_checklist_progress_status
  ON public.customer_checklist_progress (user_id, status)
  WHERE status IN ('pending', 'sent');

COMMENT ON TABLE public.customer_checklist_progress IS
  'Per-customer checklist progress. status=sent reserved for future workflow tip sends.';

CREATE OR REPLACE FUNCTION public.set_checklist_progress_owner_from_customer ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner UUID;
BEGIN
  SELECT c.user_id INTO owner FROM public.customers c WHERE c.id = NEW.customer_id;
  IF owner IS NULL THEN
    RAISE EXCEPTION 'customer not found';
  END IF;
  NEW.user_id := owner;
  NEW.updated_at := NOW ();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checklist_progress_set_user ON public.customer_checklist_progress;
CREATE TRIGGER trg_checklist_progress_set_user
  BEFORE INSERT OR UPDATE OF customer_id ON public.customer_checklist_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.set_checklist_progress_owner_from_customer ();

CREATE OR REPLACE FUNCTION public.touch_checklist_progress_updated_at ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW ();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_checklist_progress_updated ON public.customer_checklist_progress;
CREATE TRIGGER trg_checklist_progress_updated
  BEFORE UPDATE ON public.customer_checklist_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_checklist_progress_updated_at ();

ALTER TABLE public.customer_checklist_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_checklist_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read_checklist_steps"
  ON public.customer_checklist_steps FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "users_select_own_checklist_progress"
  ON public.customer_checklist_progress FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "users_insert_own_checklist_progress"
  ON public.customer_checklist_progress FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_update_own_checklist_progress"
  ON public.customer_checklist_progress FOR UPDATE TO authenticated
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_delete_own_checklist_progress"
  ON public.customer_checklist_progress FOR DELETE TO authenticated
  USING (user_id = auth.uid ());

GRANT SELECT ON public.customer_checklist_steps TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_checklist_progress TO authenticated;
GRANT ALL ON public.customer_checklist_steps TO service_role;
GRANT ALL ON public.customer_checklist_progress TO service_role;

INSERT INTO public.customer_checklist_steps (
  program_slug, step_key, sort_order, title, title_ms, description, auto_complete_source, is_active
) VALUES
  (
    'kaya_emas_2026',
    'download_pg_app',
    1,
    'Download Mobile Apps PG',
    'Download Mobile Apps PG',
    'Download the official Public Gold mobile app. Inferred complete when Direct Debit is active.',
    'direct_debit',
    TRUE
  ),
  (
    'kaya_emas_2026',
    'join_wa_group',
    2,
    'Join WhatsApp Group',
    'Join WhatsApp Group (disediakan oleh introducer)',
    'Join the WhatsApp group provided by the introducer.',
    NULL,
    TRUE
  ),
  (
    'kaya_emas_2026',
    'read_handbook_tutorial',
    3,
    'Read Customer Handbook & Tutorial',
    'Baca Customer Handbook dan rujuk link Tutorial (di website dealer)',
    'Read the customer handbook and tutorial on the dealer website.',
    NULL,
    TRUE
  ),
  (
    'kaya_emas_2026',
    'buy_read_books',
    4,
    'Buy & read Wang Emas & Misi Bebas Hutang',
    'Beli dan baca buku Wang Emas & Misi Bebas Hutang',
    'Buy and read both books.',
    NULL,
    TRUE
  ),
  (
    'kaya_emas_2026',
    'subscribe_gap_5y',
    5,
    'Subscribe GAP Auto-debit (5 years)',
    'Subscribe GAP Auto-debit selama 5 tahun',
    'Activate GAP auto-debit subscription for 5 years.',
    'direct_debit',
    TRUE
  ),
  (
    'kaya_emas_2026',
    'join_webinar_1m',
    6,
    'Join Private Webinar: Membina Satu Juta Pertama',
    'Join Private Webinar : Membina Satu Juta Pertama',
    'Attend the private webinar.',
    NULL,
    TRUE
  ),
  (
    'kaya_emas_2026',
    'join_plt_or_kempen',
    7,
    'Join PLT or Kempen Sebar Manfaat Emas',
    'Join training dealer PG Leadership Training (PLT) atau join Kempen Sebar Manfaat Emas',
    'Join PLT training or the gold benefit campaign.',
    NULL,
    TRUE
  )
ON CONFLICT (program_slug, step_key) DO UPDATE
SET
  sort_order = EXCLUDED.sort_order,
  title = EXCLUDED.title,
  title_ms = EXCLUDED.title_ms,
  description = EXCLUDED.description,
  auto_complete_source = EXCLUDED.auto_complete_source,
  is_active = EXCLUDED.is_active,
  updated_at = NOW ();
