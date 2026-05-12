import type { SalesJourneyStageKey } from '@/app/lib/customer-account-status'

const ALLOWED: ReadonlySet<SalesJourneyStageKey> = new Set([
  'prospect',
  'active_buyer',
  'warming',
  'at_risk',
  'dormant',
  'unknown',
])

/** Normalise API / query / body values to a stored `sales_journey_stage` enum key. */
const ALIASES: Record<string, SalesJourneyStageKey> = {
  prospect: 'prospect',
  'active_buyer': 'active_buyer',
  activebuyer: 'active_buyer',
  'active-buyer': 'active_buyer',
  warming: 'warming',
  engaged: 'warming',
  'at_risk': 'at_risk',
  atrisk: 'at_risk',
  'at-risk': 'at_risk',
  dormant: 'dormant',
  unknown: 'unknown',
}

/**
 * Parse `sales_journey_stage` from query params, JSON body, or imports.
 * Returns `null` when empty / unknown (caller decides default, e.g. prospect on PUT).
 */
export function parseSalesJourneyStage(raw: unknown): SalesJourneyStageKey | null {
  if (raw == null) return null
  const s = String(raw).trim().toLowerCase()
  if (!s) return null
  if (ALIASES[s]) return ALIASES[s]
  if (ALLOWED.has(s as SalesJourneyStageKey)) return s as SalesJourneyStageKey
  return null
}
