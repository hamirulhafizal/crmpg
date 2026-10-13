import { extractPhoneDigits, normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'

/** Strip characters that break PostgREST `.or()` filters. */
export function sanitizeSearchToken(raw: string): string {
  return raw
    .replace(/[%_,()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type GlobalSearchTokens = {
  /** Original trimmed query (sanitized). */
  q: string
  /** Distinct tokens to OR across columns (PG, name part, phone variants, email, etc.). */
  tokens: string[]
}

/**
 * Parse pasted CRM labels like `PG00104897 - Tn Hamirul`, phones, emails.
 * Returns multiple tokens so nested Tree Tier rows still match.
 */
export function parseGlobalCustomerSearchQuery(input: string): GlobalSearchTokens {
  const q = sanitizeSearchToken(input)
  if (!q) return { q: '', tokens: [] }

  const tokens = new Set<string>()
  tokens.add(q)

  const pgMatch = q.match(/\bPG\s*0*\d+\b/i)
  if (pgMatch) {
    const pg = normalizePgCodeValue(pgMatch[0].replace(/\s+/g, ''))
    if (pg) tokens.add(pg)
  }

  // `PG00104897 - Tn Hamirul` / `save name - PG…`
  const dashParts = q.split(/\s[-–—]\s/).map((p) => sanitizeSearchToken(p)).filter(Boolean)
  for (const part of dashParts) {
    tokens.add(part)
    const partPg = normalizePgCodeValue(part)
    if (partPg) tokens.add(partPg)
  }

  const digits = extractPhoneDigits(q)
  if (digits.length >= 7) {
    tokens.add(digits)
    if (digits.startsWith('0') && digits.length >= 9) {
      tokens.add(digits.slice(1))
    }
    try {
      const msisdn = normalizePhoneToMsisdn(digits)
      if (msisdn.length >= 10) {
        tokens.add(msisdn)
        if (msisdn.startsWith('60')) tokens.add(`0${msisdn.slice(2)}`)
      }
    } catch {
      /* ignore */
    }
  }

  return {
    q,
    tokens: Array.from(tokens).filter((t) => t.length >= 2).slice(0, 8),
  }
}

/** Build Supabase `.or()` filter across identity columns for one token. */
export function globalSearchOrFilterForToken(token: string): string {
  const t = sanitizeSearchToken(token)
  // Quote patterns so spaces / hyphens in pasted labels don't break `.or()`.
  const pattern = `"%${t.replace(/"/g, '')}%"`
  return [
    `name.ilike.${pattern}`,
    `sender_name.ilike.${pattern}`,
    `save_name.ilike.${pattern}`,
    `email.ilike.${pattern}`,
    `phone.ilike.${pattern}`,
    `pg_code.ilike.${pattern}`,
  ].join(',')
}
