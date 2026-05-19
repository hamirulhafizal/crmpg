-- n8n-style visual node types for campaign workflow canvas

INSERT INTO public.workflow_node_types (
  slug, category, label, description, handler_key, icon, n8n_type, n8n_type_version, n8n_parameters, is_system, sort_order
)
VALUES
  (
    'crm.trigger.schedule',
    'trigger',
    'Schedule (cron)',
    'Run on a cron schedule (e.g. 8AM daily)',
    'trigger',
    'clock',
    'n8n-nodes-base.scheduleTrigger',
    1.2,
    '{"rule": {"interval": [{"field": "cronExpression", "expression": "0 8 * * *"}]}}'::jsonb,
    TRUE,
    11
  ),
  (
    'crm.data.supabase',
    'integration',
    'Supabase',
    'Read or update Supabase rows',
    'supabase',
    'database',
    'n8n-nodes-base.supabase',
    1,
    '{"operation": "getAll"}'::jsonb,
    TRUE,
    21
  ),
  (
    'crm.flow.loop',
    'flow',
    'Loop',
    'Process items one by one (split in batches)',
    'loop',
    'loop',
    'n8n-nodes-base.splitInBatches',
    3,
    '{"batchSize": 1}'::jsonb,
    TRUE,
    22
  ),
  (
    'crm.data.set',
    'action',
    'Set / Edit',
    'Prepare fields or message text',
    'set',
    'edit',
    'n8n-nodes-base.set',
    3.4,
    '{"mode": "manual"}'::jsonb,
    TRUE,
    23
  ),
  (
    'crm.integration.waha',
    'integration',
    'WAHA / HTTP',
    'Send WhatsApp via WAHA HTTP',
    'whatsapp_send',
    'globe',
    'n8n-nodes-base.httpRequest',
    4.2,
    '{"method": "POST", "url": "", "authentication": "none"}'::jsonb,
    TRUE,
    41
  ),
  (
    'crm.flow.wait',
    'flow',
    'Wait',
    'Pause between steps (seconds)',
    'wait',
    'hourglass',
    'n8n-nodes-base.wait',
    1.1,
    '{"resume": "timeInterval", "amount": 30, "unit": "seconds"}'::jsonb,
    TRUE,
    42
  ),
  (
    'crm.flow.pass',
    'flow',
    'Next / pass',
    'Continue loop to next item',
    'noop',
    'forward',
    'n8n-nodes-base.noOp',
    1,
    '{}'::jsonb,
    TRUE,
    43
  )
ON CONFLICT (slug) DO UPDATE
SET
  category = EXCLUDED.category,
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  handler_key = EXCLUDED.handler_key,
  icon = EXCLUDED.icon,
  n8n_type = EXCLUDED.n8n_type,
  n8n_type_version = EXCLUDED.n8n_type_version,
  n8n_parameters = EXCLUDED.n8n_parameters,
  sort_order = EXCLUDED.sort_order;
