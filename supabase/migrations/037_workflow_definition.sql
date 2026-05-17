-- Dynamic workflow graph (source of truth) + node type catalog for palette.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS workflow_definition JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.campaigns.workflow_definition IS
  'Workflow graph: { version, nodes[], edges[] }. Canonical automation definition.';

CREATE TABLE IF NOT EXISTS public.workflow_node_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL CHECK (category IN ('trigger', 'logic', 'action', 'integration', 'flow')),
  label TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  parameter_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  handler_key TEXT NOT NULL,
  n8n_type TEXT,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_node_types_enabled ON public.workflow_node_types (enabled, sort_order);

ALTER TABLE public.workflow_node_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_node_types_select_authenticated"
  ON public.workflow_node_types FOR SELECT TO authenticated
  USING (enabled = TRUE);

GRANT SELECT ON public.workflow_node_types TO authenticated;

INSERT INTO public.workflow_node_types (slug, category, label, description, handler_key, n8n_type, sort_order)
VALUES
  ('crm.trigger.manual', 'trigger', 'Manual trigger', 'Start on test run or cron sync', 'trigger', 'n8n-nodes-base.manualTrigger', 10),
  ('crm.audience.filter', 'action', 'Audience', 'Filter CRM customers', 'audience', NULL, 20),
  ('crm.enroll.queue', 'action', 'Enroll', 'Add matching customers to queue', 'enroll', NULL, 30),
  ('crm.whatsapp.send', 'action', 'WhatsApp message', 'Send a templated WhatsApp step', 'whatsapp_send', NULL, 40),
  ('crm.flow.complete', 'flow', 'Done', 'Mark enrollment complete', 'complete', NULL, 50)
ON CONFLICT (slug) DO NOTHING;
