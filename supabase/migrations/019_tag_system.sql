-- Tag taxonomy (admin-managed catalog) + customer tag assignments (agent-owned).

CREATE TABLE IF NOT EXISTS public.tag_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  allows_multiple BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tag_categories_key_lowercase CHECK (key = lower(key))
);

CREATE UNIQUE INDEX IF NOT EXISTS tag_categories_key_unique ON public.tag_categories (key);

CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.tag_categories (id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT tags_slug_lowercase CHECK (slug = lower(slug)),
  CONSTRAINT tags_category_slug_unique UNIQUE (category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_tags_category_id ON public.tags (category_id);

CREATE TABLE IF NOT EXISTS public.customer_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers (id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'rule', 'import', 'ai')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_tags_customer_tag_unique UNIQUE (customer_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_customer_tags_customer_id ON public.customer_tags (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_tag_id ON public.customer_tags (tag_id);
CREATE INDEX IF NOT EXISTS idx_customer_tags_user_id ON public.customer_tags (user_id);

CREATE OR REPLACE FUNCTION public.set_customer_tags_user_from_customer ()
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customer_tags_set_user ON public.customer_tags;
CREATE TRIGGER trg_customer_tags_set_user
  BEFORE INSERT OR UPDATE OF customer_id ON public.customer_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.set_customer_tags_user_from_customer ();

CREATE TRIGGER update_tag_categories_updated_at
  BEFORE UPDATE ON public.tag_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column ();

CREATE TRIGGER update_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column ();

ALTER TABLE public.tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_select_tag_categories"
  ON public.tag_categories FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "authenticated_select_tags"
  ON public.tags FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY "users_select_own_customer_tags"
  ON public.customer_tags FOR SELECT TO authenticated
  USING (user_id = auth.uid ());

CREATE POLICY "users_insert_own_customer_tags"
  ON public.customer_tags FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_update_own_customer_tags"
  ON public.customer_tags FOR UPDATE TO authenticated
  USING (user_id = auth.uid ())
  WITH CHECK (user_id = auth.uid ());

CREATE POLICY "users_delete_own_customer_tags"
  ON public.customer_tags FOR DELETE TO authenticated
  USING (user_id = auth.uid ());

COMMENT ON TABLE public.tag_categories IS 'Admin-managed tag dimensions (lifecycle, behavior, etc.).';
COMMENT ON TABLE public.tags IS 'Labels within a category; admin-managed catalog.';
COMMENT ON TABLE public.customer_tags IS 'Tags assigned to customers; scoped by owning agent user_id.';

INSERT INTO public.tag_categories (key, name, description, sort_order, allows_multiple)
VALUES
  ('lifecycle', 'Lifecycle', 'Customer lifecycle stage (Prospect, VIP, etc.).', 10, FALSE),
  ('behavior_buy', 'Behavior (gold purchase)', 'Buying behaviour for segmentation.', 20, FALSE),
  ('product_interest', 'Product interest', 'Products or programmes of interest.', 30, TRUE),
  ('value_tier', 'Value tier', 'Spend band for prioritisation.', 40, FALSE),
  ('goal', 'Financial goal', 'Primary savings or life goal.', 50, TRUE),
  ('engagement', 'Engagement', 'Lead temperature and response.', 60, FALSE),
  ('network', 'Network / referral', 'Referral and dealer-network signals.', 70, TRUE),
  ('location', 'Location', 'State / region for local campaigns.', 80, TRUE),
  ('timing', 'Timing behaviour', 'When they tend to buy.', 90, FALSE)
ON CONFLICT (key) DO NOTHING;
