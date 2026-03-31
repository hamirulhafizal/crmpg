import { getStates, getCities } from 'malaysia-postcodes'

/**
 * Extra locality names not present (or named differently) in `malaysia-postcodes`.
 * Edit this list to extend the dropdown — e.g. suburbs, new townships, or spelling variants.
 */
export const EXTRA_LOCALITY_NAMES: string[] = [
  'Puchong',
  'Bandar Puchong Jaya',
  'Kota Damansara',
  'Petaling Jaya',
  'Subang Jaya',
  'Shah Alam',
  'Kuala Lumpur',
  'Selangor',
  'Johor',
  'Kedah',
  'Kelantan',
]

function collectCitiesFromLibrary(): string[] {
  const states = getStates()
  const names = new Set<string>()
  for (const state of states) {
    const cities = getCities(state)
    if (!Array.isArray(cities)) continue
    for (const c of cities) {
      const t = typeof c === 'string' ? c.trim() : ''
      if (t) names.add(t)
    }
  }
  return Array.from(names)
}

let cachedMerged: string[] | null = null

/** All unique locality labels: library cities + extras, sorted for display. */
export function getMergedLocalityNames(): string[] {
  if (cachedMerged) return cachedMerged
  const set = new Set<string>(collectCitiesFromLibrary())
  for (const raw of EXTRA_LOCALITY_NAMES) {
    const t = raw.trim()
    if (t) set.add(t)
  }
  cachedMerged = Array.from(set).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))
  return cachedMerged
}

/** Case-insensitive substring filter, capped for performance in the UI. */
export function filterLocalityNames(query: string, all: string[], limit = 80): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return all.slice(0, limit)
  return all.filter((n) => n.toLowerCase().includes(q)).slice(0, limit)
}
