import { formatLastPurchaseForTemplate } from '@/app/lib/customer-account-status'

/**
 * Scalar / JSON columns on `public.customers` that can be used in
 * `{{column_name}}` placeholders (excluding `id` and `user_id`).
 *
 * Due-send loads `customer:customers (*)` so all present columns are available to templates.
 */
export const CUSTOMER_MESSAGE_TEMPLATE_COLUMNS = [
  'name',
  'dob',
  'email',
  'phone',
  'location',
  'gender',
  'ethnicity',
  'age',
  'prefix',
  'first_name',
  'sender_name',
  'save_name',
  'pg_code',
  'row_number',
  'last_purchase_at',
  'is_monthly_buyer',
  'is_married',
  'is_friend',
  'segment_attributes',
  'original_data',
  'last_synced_at',
  'phone_e164',
  'email_normalized',
  'sales_journey_stage',
  'sales_journey_updated_at',
  'created_at',
  'updated_at',
] as const

const SPECIAL_TEMPLATE_KEYS = new Set(['name', 'first_name', 'last_purchase_at'])

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

function scalarToTemplateString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return ''
    }
  }
  return String(value)
}

export function buildTemplateVariableMap(c: Record<string, unknown>): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const key of CUSTOMER_MESSAGE_TEMPLATE_COLUMNS) {
    if (SPECIAL_TEMPLATE_KEYS.has(key)) continue
    vars[key] = scalarToTemplateString(c[key])
  }

  const nameStr = typeof c.name === 'string' ? c.name.trim() : ''
  const saveStr = typeof c.save_name === 'string' ? c.save_name.trim() : ''
  vars.name = nameStr || saveStr || 'there'

  const firstStr = typeof c.first_name === 'string' ? c.first_name.trim() : ''
  const firstFromName = typeof c.name === 'string' ? c.name.split(/\s+/)[0]?.trim() : ''
  vars.first_name = firstStr || firstFromName || 'there'

  const lastAt = c.last_purchase_at
  vars.last_purchase_at =
    typeof lastAt === 'string' && lastAt.trim()
      ? formatLastPurchaseForTemplate(c) || new Date(lastAt).toLocaleDateString()
      : ''

  return vars
}

export function renderCampaignTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(PLACEHOLDER, (_, key: string) => {
    const k = key.toLowerCase()
    const direct = vars[key] ?? vars[k]
    if (direct !== undefined) return direct
    return ''
  })
}
