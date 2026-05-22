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
        run_date: { type: 'string' },
        run_time: { type: 'string' },
        run_frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
        run_weekday: { type: 'number', minimum: 0, maximum: 6 },
        run_day_of_month: { type: 'number', minimum: 1, maximum: 31 },
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
  {
    slug: 'crm.trigger.schedule',
    category: 'trigger',
    label: 'Schedule (cron)',
    description: 'Run on a cron schedule (e.g. 8AM daily)',
    icon: 'clock',
    parameter_schema: {
      type: 'object',
      properties: {
        cron_expression: { type: 'string' },
        display_name: { type: 'string' },
        run_date: { type: 'string' },
        run_time: { type: 'string' },
        run_frequency: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
        run_weekday: { type: 'number', minimum: 0, maximum: 6 },
        run_day_of_month: { type: 'number', minimum: 1, maximum: 31 },
      },
    },
    handler_key: 'trigger',
    n8n_type: 'n8n-nodes-base.scheduleTrigger',
    n8n_type_version: 1.2,
    n8n_parameters: { rule: { interval: [{ field: 'cronExpression', expression: '0 8 * * *' }] } },
    is_system: true,
    enabled: true,
    sort_order: 11,
  },
  {
    slug: 'crm.data.supabase',
    category: 'integration',
    label: 'Supabase',
    description: 'Read or update Supabase rows',
    icon: 'database',
    parameter_schema: {
      type: 'object',
      properties: {
        operation: { type: 'string' },
        table: { type: 'string' },
        audience_filters: { type: 'object' },
        display_name: { type: 'string' },
      },
    },
    handler_key: 'supabase',
    n8n_type: 'n8n-nodes-base.supabase',
    n8n_type_version: 1,
    n8n_parameters: { operation: 'getAll' },
    is_system: true,
    enabled: true,
    sort_order: 21,
  },
  {
    slug: 'crm.flow.loop',
    category: 'flow',
    label: 'Loop',
    description: 'Process items one by one (split in batches)',
    icon: 'loop',
    parameter_schema: {
      type: 'object',
      properties: { batch_size: { type: 'number' }, display_name: { type: 'string' } },
    },
    handler_key: 'loop',
    n8n_type: 'n8n-nodes-base.splitInBatches',
    n8n_type_version: 3,
    n8n_parameters: { batchSize: 1, options: {} },
    is_system: true,
    enabled: true,
    sort_order: 22,
  },
  {
    slug: 'crm.data.set',
    category: 'action',
    label: 'Set / Edit',
    description: 'Prepare fields or message text',
    icon: 'edit',
    parameter_schema: { type: 'object' },
    handler_key: 'set',
    n8n_type: 'n8n-nodes-base.set',
    n8n_type_version: 3.4,
    n8n_parameters: { mode: 'manual' },
    is_system: true,
    enabled: true,
    sort_order: 23,
  },
  {
    slug: 'crm.integration.waha',
    category: 'integration',
    label: 'WAHA / HTTP',
    description: 'Send WhatsApp via WAHA HTTP',
    icon: 'globe',
    parameter_schema: {
      type: 'object',
      properties: {
        step_order: { type: 'number' },
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
    sort_order: 41,
  },
  {
    slug: 'crm.flow.wait',
    category: 'flow',
    label: 'Wait',
    description: 'Pause between WhatsApp steps (random min–max wait)',
    icon: 'hourglass',
    parameter_schema: {
      type: 'object',
      properties: {
        wait_min_seconds: { type: 'number' },
        wait_max_seconds: { type: 'number' },
        display_name: { type: 'string' },
      },
    },
    handler_key: 'wait',
    n8n_type: 'n8n-nodes-base.wait',
    n8n_type_version: 1.1,
    n8n_parameters: { resume: 'timeInterval', amount: 30, unit: 'seconds' },
    is_system: true,
    enabled: true,
    sort_order: 42,
  },
  {
    slug: 'crm.flow.pass',
    category: 'flow',
    label: 'Next / pass',
    description: 'Continue loop to next item',
    icon: 'forward',
    parameter_schema: { type: 'object' },
    handler_key: 'noop',
    n8n_type: 'n8n-nodes-base.noOp',
    n8n_type_version: 1,
    n8n_parameters: {},
    is_system: true,
    enabled: true,
    sort_order: 43,
  },
]

export function getBuiltinNodeType(slug: string): WorkflowNodeTypeDescriptor | undefined {
  return BUILTIN_WORKFLOW_NODE_TYPES.find((t) => t.slug === slug)
}

export function defaultParametersForType(slug: WorkflowNodeTypeSlug | string): Record<string, unknown> {
  switch (slug) {
    case 'crm.trigger.manual':
      return { trigger_type: 'manual', trigger_offset_days: 0, run_date: '', run_time: '', run_frequency: 'daily', run_weekday: 1, run_day_of_month: 1 }
    case 'crm.audience.filter':
      return { audience_filters: {} }
    case 'crm.enroll.queue':
      return { daily_send_limit: 100, cooldown_days: 30 }
    case 'crm.whatsapp.send':
      return {
        step_order: 1,
        delay_days: 0,
        send_time: '10:00',
        message_template: 'Salam {SenderName}',
        is_active: true,
      }
    case 'crm.flow.complete':
      return {}
    case 'crm.trigger.schedule':
      return { cron_expression: '0 8 * * *', display_name: 'Schedule', run_date: '', run_time: '', run_frequency: 'daily', run_weekday: 1, run_day_of_month: 1 }
    case 'crm.data.supabase':
      return { operation: 'getAll', table: 'customers', audience_filters: {} }
    case 'crm.flow.loop':
      return { batch_size: 1, display_name: 'Loop' }
    case 'crm.data.set':
      return { display_name: 'Set', message1: '', message2: '' }
    case 'crm.integration.waha':
      return {
        step_order: 1,
        delay_days: 0,
        send_time: '10:00',
        message_template: 'Salam {SenderName}',
        is_active: true,
      }
    case 'crm.flow.wait':
      return { wait_min_seconds: 60, wait_max_seconds: 120 }
    case 'crm.flow.pass':
      return { display_name: 'Next' }
    default:
      return {}
  }
}
