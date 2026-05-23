INSERT INTO public.workflow_node_types (
  slug,
  category,
  label,
  description,
  icon,
  handler_key,
  parameter_schema,
  is_system,
  enabled,
  sort_order,
  n8n_type,
  n8n_type_version,
  n8n_parameters
)
VALUES (
  'crm.whatsapp.send_image',
  'action',
  'WhatsApp image',
  'Send a personalized image with text overlays',
  'image',
  'whatsapp_send_image',
  '{"type":"object"}'::jsonb,
  true,
  true,
  41,
  'n8n-nodes-base.httpRequest',
  4.2,
  '{"method":"POST","url":"","authentication":"none"}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  sort_order = EXCLUDED.sort_order;
