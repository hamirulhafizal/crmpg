import type { WorkflowNodeCategory } from '@/app/lib/workflows/types'

const CATEGORIES: WorkflowNodeCategory[] = ['trigger', 'logic', 'action', 'integration', 'flow']
const HANDLER_KEYS = ['trigger', 'audience', 'enroll', 'whatsapp_send', 'complete', 'noop'] as const

const SLUG_RE = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/
const N8N_TYPE_RE = /^[a-zA-Z0-9@][a-zA-Z0-9@._-]*$/

export type WorkflowNodeTypeInput = {
  slug?: string
  category?: string
  label?: string
  description?: string | null
  icon?: string | null
  parameter_schema?: Record<string, unknown>
  handler_key?: string
  n8n_type?: string | null
  n8n_type_version?: number
  n8n_parameters?: Record<string, unknown>
  enabled?: boolean
  sort_order?: number
}

export function validateWorkflowNodeTypeInput(
  body: WorkflowNodeTypeInput,
  partial = false
): { ok: true; data: Required<Pick<WorkflowNodeTypeInput, 'slug' | 'category' | 'label' | 'handler_key'>> & WorkflowNodeTypeInput } | { ok: false; error: string } {
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  const category = typeof body.category === 'string' ? body.category.trim() : ''
  const label = typeof body.label === 'string' ? body.label.trim() : ''
  const handler_key = typeof body.handler_key === 'string' ? body.handler_key.trim() : ''

  if (!partial) {
    if (!slug || !SLUG_RE.test(slug)) {
      return { ok: false, error: 'slug must be dot-separated lowercase segments (e.g. crm.action.foo)' }
    }
    if (!CATEGORIES.includes(category as WorkflowNodeCategory)) {
      return { ok: false, error: `category must be one of: ${CATEGORIES.join(', ')}` }
    }
    if (!label) return { ok: false, error: 'label is required' }
    if (!handler_key || !HANDLER_KEYS.includes(handler_key as (typeof HANDLER_KEYS)[number])) {
      return { ok: false, error: `handler_key must be one of: ${HANDLER_KEYS.join(', ')}` }
    }
  }

  const n8n_type =
    body.n8n_type === null || body.n8n_type === undefined
      ? null
      : typeof body.n8n_type === 'string'
        ? body.n8n_type.trim() || null
        : null

  if (n8n_type && !N8N_TYPE_RE.test(n8n_type)) {
    return { ok: false, error: 'n8n_type format is invalid' }
  }

  const n8n_type_version =
    typeof body.n8n_type_version === 'number' && Number.isFinite(body.n8n_type_version)
      ? Math.max(1, body.n8n_type_version)
      : undefined

  const parameter_schema =
    body.parameter_schema !== undefined && typeof body.parameter_schema === 'object' && body.parameter_schema !== null
      ? body.parameter_schema
      : undefined

  const n8n_parameters =
    body.n8n_parameters !== undefined && typeof body.n8n_parameters === 'object' && body.n8n_parameters !== null
      ? body.n8n_parameters
      : undefined

  return {
    ok: true,
    data: {
      slug,
      category,
      label,
      handler_key,
      description: typeof body.description === 'string' ? body.description.trim() || null : body.description ?? null,
      icon: typeof body.icon === 'string' ? body.icon.trim() || null : body.icon ?? null,
      parameter_schema,
      n8n_type,
      n8n_type_version,
      n8n_parameters,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
      sort_order:
        typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
          ? Math.trunc(body.sort_order)
          : undefined,
    },
  }
}

export function n8nTypeFromPaste(node: { type: string; typeVersion?: number; parameters?: Record<string, unknown> }): {
  n8n_type: string
  n8n_type_version: number
  n8n_parameters: Record<string, unknown>
} {
  const { _crmType: _, ...rest } = node.parameters ?? {}
  return {
    n8n_type: node.type,
    n8n_type_version: node.typeVersion ?? 1,
    n8n_parameters: rest,
  }
}
