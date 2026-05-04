-- App reads/writes segment_attributes on customers (PUT /api/customers/[id]); column was missing from DB.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS segment_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.customers.segment_attributes IS 'Optional structured segmentation data; complements CRM tags.';
