-- One follow-up checkpoint per user (last opened customer + list snapshot) for cross-device resume.

CREATE TABLE IF NOT EXISTS public.user_follow_up_bookmarks (
  user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  save_name TEXT NOT NULL DEFAULT '',
  account_status_filter TEXT NOT NULL DEFAULT '',
  page INTEGER NOT NULL DEFAULT 1 CHECK (page >= 1),
  view_mode TEXT NOT NULL DEFAULT 'paginated' CHECK (view_mode IN ('paginated', 'all')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW ()
);

CREATE INDEX IF NOT EXISTS idx_user_follow_up_bookmarks_customer_id
  ON public.user_follow_up_bookmarks (customer_id);

COMMENT ON TABLE public.user_follow_up_bookmarks IS 'Per-user follow-up queue checkpoint; synced from CRM customers page.';

CREATE OR REPLACE FUNCTION public.touch_user_follow_up_bookmark_updated_at ()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_follow_up_bookmarks_updated ON public.user_follow_up_bookmarks;
CREATE TRIGGER trg_user_follow_up_bookmarks_updated
  BEFORE UPDATE ON public.user_follow_up_bookmarks
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_user_follow_up_bookmark_updated_at ();

ALTER TABLE public.user_follow_up_bookmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "users_insert_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_update_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR UPDATE TO authenticated
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_delete_own_follow_up_bookmark"
  ON public.user_follow_up_bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid ());
