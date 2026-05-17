-- n8n interoperability fields on workflow node catalog

ALTER TABLE public.workflow_node_types
  ADD COLUMN IF NOT EXISTS n8n_type_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS n8n_parameters JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.workflow_node_types.n8n_type_version IS
  'n8n node typeVersion copied when exporting / pasting into n8n canvas.';

COMMENT ON COLUMN public.workflow_node_types.n8n_parameters IS
  'Default n8n node parameters JSON (merged with _crmType on export).';

UPDATE public.workflow_node_types
SET
  n8n_type = 'n8n-nodes-base.filter',
  n8n_type_version = 2,
  n8n_parameters = '{}'::jsonb
WHERE slug = 'crm.audience.filter' AND (n8n_type IS NULL OR n8n_type = '');

UPDATE public.workflow_node_types
SET
  n8n_type = 'n8n-nodes-base.noOp',
  n8n_type_version = 1,
  n8n_parameters = '{}'::jsonb
WHERE slug = 'crm.enroll.queue' AND (n8n_type IS NULL OR n8n_type = '');

UPDATE public.workflow_node_types
SET
  n8n_type = 'n8n-nodes-base.httpRequest',
  n8n_type_version = 4.2,
  n8n_parameters = '{"method": "POST", "url": "", "authentication": "none"}'::jsonb
WHERE slug = 'crm.whatsapp.send' AND (n8n_type IS NULL OR n8n_type = '');

UPDATE public.workflow_node_types
SET
  n8n_type = 'n8n-nodes-base.noOp',
  n8n_type_version = 1,
  n8n_parameters = '{}'::jsonb
WHERE slug = 'crm.flow.complete' AND (n8n_type IS NULL OR n8n_type = '');

UPDATE public.workflow_node_types
SET
  n8n_type_version = 1,
  n8n_parameters = COALESCE(n8n_parameters, '{}'::jsonb)
WHERE slug = 'crm.trigger.manual';

INSERT INTO public.workflow_node_types (
  slug, category, label, description, handler_key, n8n_type, n8n_type_version, n8n_parameters, is_system, sort_order
)
VALUES (
  'crm.logic.if',
  'logic',
  'IF',
  'Branch on a condition (visual only until executor supports branches)',
  'noop',
  'n8n-nodes-base.if',
  2,
  '{"conditions": {"options": {"version": 2, "leftValue": "", "caseSensitive": true, "typeValidation": "strict"}, "combinator": "and", "conditions": []}}'::jsonb,
  TRUE,
  25
)
ON CONFLICT (slug) DO UPDATE
SET
  n8n_type = EXCLUDED.n8n_type,
  n8n_type_version = EXCLUDED.n8n_type_version,
  n8n_parameters = EXCLUDED.n8n_parameters,
  handler_key = EXCLUDED.handler_key;
