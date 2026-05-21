import {
  formatLastPurchaseForTemplate,
  formatRegistrationForTemplate,
} from '@/app/lib/customer-account-status'

/** Maps DB column names to automated-messages style placeholders, e.g. sender_name → SenderName. */
const COLUMN_TO_TEMPLATE_VAR: Record<string, string> = {
  pg_code: 'PGCode',
  first_name: 'FirstName',
  sender_name: 'SenderName',
  save_name: 'SaveName',
  dob: 'DOB',
  last_purchase_at: 'LastPurchaseDate',
  created_at: 'RegistrationDate',
}

export function customerColumnToTemplateVarName(col: string): string {
  if (COLUMN_TO_TEMPLATE_VAR[col]) return COLUMN_TO_TEMPLATE_VAR[col]
  return col
    .split('_')
    .map((part) => (part ? part[0]!.toUpperCase() + part.slice(1) : ''))
    .join('')
}

/**
 * Scalar / JSON columns on `public.customers` for `{VariableName}` placeholders
 * (excluding `id` and `user_id`).
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

const SPECIAL_TEMPLATE_KEYS = new Set(['name', 'first_name', 'last_purchase_at', 'created_at'])

/** Legacy `{{snake_case}}` placeholders (still supported when rendering). */
const DOUBLE_PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/** Automated-messages style `{PascalCase}` placeholders. */
const SINGLE_PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9]*)\}/g

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

  vars.LastPurchaseDate = vars.last_purchase_at

  vars.RegistrationDate = formatRegistrationForTemplate(
    c.original_data,
    typeof c.created_at === 'string' ? c.created_at : undefined
  )

  for (const key of CUSTOMER_MESSAGE_TEMPLATE_COLUMNS) {
    const varName = customerColumnToTemplateVarName(key)
    if (vars[varName] === undefined) {
      vars[varName] = vars[key] ?? ''
    }
  }

  return vars
}

function lookupTemplateVar(vars: Record<string, string>, key: string): string {
  const direct = vars[key] ?? vars[key.toLowerCase()]
  if (direct !== undefined) return direct

  const snake = key
    .replace(/([A-Z])/g, (_, ch: string) => `_${ch.toLowerCase()}`)
    .replace(/^_/, '')
  return vars[snake] ?? vars[snake.toLowerCase()] ?? ''
}

export function renderCampaignTemplate(template: string, vars: Record<string, string>): string {
  const withLegacy = template.replace(DOUBLE_PLACEHOLDER, (_, key: string) => lookupTemplateVar(vars, key))
  return withLegacy.replace(SINGLE_PLACEHOLDER, (_, key: string) => lookupTemplateVar(vars, key))
}
