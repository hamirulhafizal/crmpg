import type { WorkflowNodeTypeDescriptor, WorkflowNodeTypeSlug } from '@/app/lib/workflows/types'

/** Fallback catalog when DB is empty or unavailable. */
export const BUILTIN_WORKFLOW_NODE_TYPES: WorkflowNodeTypeDescriptor[] = [
  {
    slug: 'crm.trigger.manual',
    category: 'trigger',
    label: 'Manual trigger',
    description: 'Start on test run or cron sync',
    icon: 'bolt',
    parameter_schema: {
      type: 'object',
      properties: {
        trigger_type: { type: 'string', enum: ['manual', 'birthday', 'last_purchase', 'enrollment'] },
        trigger_offset_days: { type: 'number', minimum: 0 },
      },
    },
    handler_key: 'trigger',
    n8n_type: 'n8n-nodes-base.manualTrigger',
    n8n_type_version: 1,
    n8n_parameters: {},
    is_system: true,
    enabled: true,
    sort_order: 10,
  },
  {
    slug: 'crm.audience.filter',
    category: 'action',
    label: 'Audience',
    description: 'Filter CRM customers',
    icon: 'users',
    parameter_schema: { type: 'object' },
    handler_key: 'audience',
    n8n_type: 'n8n-nodes-base.filter',
    n8n_type_version: 2,
    n8n_parameters: {},
    is_system: true,
    enabled: true,
    sort_order: 20,
  },
  {
    slug: 'crm.enroll.queue',
    category: 'action',
    label: 'Enroll',
    description: 'Queue matching customers',
    icon: 'plus',
    parameter_schema: {
      type: 'object',
      properties: {
        daily_send_limit: { type: 'number', minimum: 1 },
        cooldown_days: { type: 'number', minimum: 0 },
      },
    },
    handler_key: 'enroll',
    n8n_type: 'n8n-nodes-base.noOp',
    n8n_type_version: 1,
    n8n_parameters: {},
    is_system: true,
    enabled: true,
    sort_order: 30,
  },
  {
    slug: 'crm.whatsapp.send',
    category: 'action',
    label: 'WhatsApp message',
    description: 'Send templated WhatsApp',
    icon: 'chat',
    parameter_schema: {
      type: 'object',
      properties: {
        step_order: { type: 'number', minimum: 1 },
        delay_days: { type: 'number', minimum: 0 },
        send_time: { type: 'string' },
        message_template: { type: 'string' },
        is_active: { type: 'boolean' },
      },
    },
    handler_key: 'whatsapp_send',
    n8n_type: 'n8n-nodes-base.httpRequest',
    n8n_type_version: 4.2,
    n8n_parameters: { method: 'POST', url: '', authentication: 'none' },
    is_system: true,
    enabled: true,
    sort_order: 40,
  },
  {
    slug: 'crm.flow.complete',
    category: 'flow',
    label: 'Done',
    description: 'End of workflow',
    icon: 'check',
    parameter_schema: { type: 'object' },
    handler_key: 'complete',
    n8n_type: 'n8n-nodes-base.noOp',
    n8n_type_version: 1,
    n8n_parameters: {},
    is_system: true,
    enabled: true,
    sort_order: 50,
  },
]

export function getBuiltinNodeType(slug: string): WorkflowNodeTypeDescriptor | undefined {
  return BUILTIN_WORKFLOW_NODE_TYPES.find((t) => t.slug === slug)
}

export function defaultParametersForType(slug: WorkflowNodeTypeSlug | string): Record<string, unknown> {
  switch (slug) {
    case 'crm.trigger.manual':
      return { trigger_type: 'manual', trigger_offset_days: 0 }
    case 'crm.audience.filter':
      return { audience_filters: {} }
    case 'crm.enroll.queue':
      return { daily_send_limit: 100, cooldown_days: 30 }
    case 'crm.whatsapp.send':
      return {
        step_order: 1,
        delay_days: 0,
        send_time: '10:00',
        message_template: 'Hello {{name}}, …',
        is_active: true,
      }
    case 'crm.flow.complete':
      return {}
    default:
      return {}
  }
}
