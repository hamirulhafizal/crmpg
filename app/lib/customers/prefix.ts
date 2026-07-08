export type CustomerPrefix = 'Adik' | 'Tn' | 'Pn' | 'Cik'

function normalizeAge(age: unknown): number | null {
  if (typeof age === 'number' && Number.isFinite(age)) return Math.floor(age)
  if (typeof age === 'string') {
    const trimmed = age.trim()
    if (!trimmed) return null
    const n = Number(trimmed)
    if (Number.isFinite(n)) return Math.floor(n)
  }
  return null
}

/** Honorific from age + gender (Malaysian CRM convention). */
export function resolveCustomerPrefix(
  gender: string | null | undefined,
  age: number | string | null | undefined
): CustomerPrefix | null {
  const a = normalizeAge(age)

  if (a != null && a < 18) {
    return 'Adik'
  }

  const g = (gender || '').trim().toLowerCase()
  if (g !== 'male' && g !== 'female') return null

  if (g === 'male') {
    return 'Tn'
  }

  if (a == null || a < 26) return 'Cik'
  return 'Pn'
}

export function buildSenderName(prefix: CustomerPrefix, firstName: string): string {
  const name = firstName.trim()
  return name ? `${prefix} ${name}` : prefix
}

export function buildSaveName(senderName: string, pgCode: string | null | undefined): string {
  const sender = senderName.trim()
  const code = (pgCode || '').trim()
  if (!sender) return code
  return code ? `${sender} - ${code}` : sender
}

export type ProcessRowNaming = {
  row_number?: number
  Gender?: string
  Ethnicity?: string
  Age?: number | string
  Prefix?: string
  FirstName?: string
  SenderName?: string
  SaveName?: string
}

/** Apply deterministic prefix + derived names after OpenAI (or for re-sync). */
export function applyCustomerNamingFields(
  result: ProcessRowNaming,
  pgCode: string | null | undefined
): ProcessRowNaming {
  const firstName = (result.FirstName || '').trim()
  const prefix = resolveCustomerPrefix(result.Gender, result.Age)

  if (!prefix || !firstName) {
    return result
  }

  const senderName = buildSenderName(prefix, firstName)
  const saveName = buildSaveName(senderName, pgCode)

  return {
    ...result,
    Prefix: prefix,
    SenderName: senderName,
    SaveName: saveName,
  }
}
