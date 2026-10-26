import { buildSaveName } from '@/app/lib/customers/prefix'

export function collapsePersonName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Google Contacts / WhatsApp save name.
 * T1: `Tn Zafran - PG00221718`
 * T2–T4: `Tn Zafran - PG00221718 - T2(Pn Khairunnisa)`
 */
export function buildGoogleContactSaveName(input: {
  saveName?: string | null
  senderName?: string | null
  pgCode?: string | null
  treeTier?: number | null
  parentSenderName?: string | null
}): string {
  const sender = collapsePersonName(input.senderName)
  const existing = collapsePersonName(input.saveName)
  const base = existing || buildSaveName(sender, input.pgCode)
  const tier = input.treeTier
  if (!base) return ''
  if (tier == null || !Number.isFinite(tier) || tier < 2 || tier > 4) return base

  const parent = collapsePersonName(input.parentSenderName)
  const suffix = parent ? `T${tier}(${parent})` : `T${tier}`
  const alreadyTagged = new RegExp(`\\s-\\sT${tier}(\\(|$)`)
  if (alreadyTagged.test(base)) return base
  return `${base} - ${suffix}`
}

export function readGoogleContactNameFromRow(row: Record<string, unknown>): string {
  const pick = (...keys: string[]) => {
    for (const key of keys) {
      const value = collapsePersonName(row[key])
      if (value) return value
    }
    return ''
  }
  return pick(
    'SaveName',
    'savename',
    'SAVENAME',
    'SenderName',
    'FirstName',
    'First Name',
    'Name'
  )
}

/** People API write fields. `displayName` is output-only and must not be sent. */
export function toGooglePeopleName(contactName: string): {
  unstructuredName: string
  givenName: string
} {
  return {
    unstructuredName: contactName,
    givenName: contactName,
  }
}
