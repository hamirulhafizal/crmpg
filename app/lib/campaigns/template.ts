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

/** Same tokens as /api/automation/send — order longest-first to avoid partial overlaps. */
const AUTOMATION_TEMPLATE_TOKENS = [
  'LastPurchaseDate',
  'RegistrationDate',
  'SalesJourneyStage',
  'SalesJourneyUpdatedAt',
  'EmailNormalized',
  'IsMonthlyBuyer',
  'SegmentAttributes',
  'OriginalData',
  'LastSyncedAt',
  'PhoneE164',
  'SenderName',
  'FirstName',
  'SaveName',
  'PGCode',
  'Prefix',
  'Gender',
  'Ethnicity',
  'Location',
  'Phone',
  'Email',
  'Name',
  'Age',
  'DOB',
] as const

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

const SPECIAL_TEMPLATE_KEYS = new Set(['name', 'first_name', 'last_purchase_at', 'created_at', 'sender_name'])

/** Legacy `{{snake_case}}` placeholders (still supported when rendering). */
const DOUBLE_PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

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

function pascalToSnake(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

/** Normalise copy-pasted fullwidth or odd braces to ASCII `{` `}`. */
function normalizeTemplateBraces(text: string): string {
  return text.replace(/\uFF5B/g, '{').replace(/\uFF5D/g, '}')
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
  vars.Name = vars.name

  const firstStr = typeof c.first_name === 'string' ? c.first_name.trim() : ''
  const firstFromName = typeof c.name === 'string' ? c.name.split(/\s+/)[0]?.trim() : ''
  vars.first_name = firstStr || firstFromName || vars.name
  vars.FirstName = vars.first_name

  const senderStr = scalarToTemplateString(c.sender_name)
  vars.sender_name = senderStr || vars.name || vars.first_name
  vars.SenderName = vars.sender_name

  vars.save_name = saveStr || vars.name
  vars.SaveName = vars.save_name

  vars.pg_code = scalarToTemplateString(c.pg_code)
  vars.PGCode = vars.pg_code

  vars.prefix = scalarToTemplateString(c.prefix)
  vars.Prefix = vars.prefix

  vars.dob = scalarToTemplateString(c.dob)
  vars.DOB = vars.dob

  vars.email = scalarToTemplateString(c.email)
  vars.Email = vars.email

  vars.phone = scalarToTemplateString(c.phone)
  vars.Phone = vars.phone

  vars.location = scalarToTemplateString(c.location)
  vars.Location = vars.location

  vars.gender = scalarToTemplateString(c.gender)
  vars.Gender = vars.gender

  vars.ethnicity = scalarToTemplateString(c.ethnicity)
  vars.Ethnicity = vars.ethnicity

  const ageVal = c.age
  vars.age = ageVal != null && ageVal !== '' ? String(ageVal) : ''
  vars.Age = vars.age

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

  const snake = pascalToSnake(key)
  return vars[snake] ?? vars[snake.toLowerCase()] ?? ''
}

function replaceBraceToken(text: string, token: string, value: string): string {
  return text.split(`{${token}}`).join(value)
}

export function renderCampaignTemplate(template: string, vars: Record<string, string>): string {
  let out = normalizeTemplateBraces(template)

  out = out.replace(DOUBLE_PLACEHOLDER, (_, key: string) => lookupTemplateVar(vars, key))

  const tokens = new Set<string>(AUTOMATION_TEMPLATE_TOKENS)
  for (const key of Object.keys(vars)) {
    if (/^[A-Z]/.test(key)) tokens.add(key)
  }

  const sorted = [...tokens].sort((a, b) => b.length - a.length)
  for (const token of sorted) {
    out = replaceBraceToken(out, token, vars[token] ?? lookupTemplateVar(vars, token))
  }

  return out
}

/** Render using a customer row (same variable rules as automated WhatsApp messages). */
export function renderCampaignTemplateForCustomer(
  template: string,
  customer: Record<string, unknown>
): string {
  return renderCampaignTemplate(template, buildTemplateVariableMap(customer))
}
