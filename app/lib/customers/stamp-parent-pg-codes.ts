import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'

function normalizePersonName(value: unknown): string {
  return String(value ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .toUpperCase()
}

function isBlankParentName(value: unknown): boolean {
  const t = String(value ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!t) return true
  return t === '-' || t === '—' || t === '–' || t.toLowerCase() === 'n/a'
}

function asOriginalRecord(
  originalData: unknown
): Record<string, unknown> | null {
  if (!originalData || typeof originalData !== 'object' || Array.isArray(originalData)) {
    return null
  }
  return originalData as Record<string, unknown>
}

function readOriginalParentName(originalData: unknown): string | null {
  const data = asOriginalRecord(originalData)
  if (!data) return null
  if (!('Parent Name' in data) && !('parent_name' in data)) return null
  const raw = data['Parent Name'] ?? data.parent_name
  return raw == null ? '' : String(raw)
}

/** Parent PG written by extension sync for the Tree Tier that was scraped. */
function readOriginalViewedParentPg(originalData: unknown): string {
  const data = asOriginalRecord(originalData)
  if (!data) return ''
  return (
    normalizePgCodeValue(data['Parent PGCode']) ||
    normalizePgCodeValue(data.parent_pg_code) ||
    normalizePgCodeValue(data._viewed_pg_code) ||
    ''
  )
}

type CustomerStampRow = {
  id: string
  pg_code: string | null
  name: string | null
  parent_pg_code: string | null
  original_data: unknown
}

/**
 * Resolve parent_pg_code from BC Parent Name in original_data.
 * - Parent Name "-" / empty → prefer scraped Parent PGCode / viewed tier, else root
 * - Parent Name = person → match that name to another customer's pg_code
 */
export function resolveParentPgCodeForRow(
  row: Pick<CustomerStampRow, 'original_data' | 'parent_pg_code'>,
  nameToPg: Map<string, string>,
  rootPgCode: string
): string | null {
  const parentName = readOriginalParentName(row.original_data)
  if (parentName == null) return null

  if (isBlankParentName(parentName)) {
    // Keep nested tier links: extension stores the viewed dealer's PG here.
    const scrapedParent = readOriginalViewedParentPg(row.original_data)
    if (scrapedParent) return scrapedParent
    const existing = normalizePgCodeValue(row.parent_pg_code)
    if (existing) return existing
    return normalizePgCodeValue(rootPgCode) || null
  }

  const key = normalizePersonName(parentName)
  const named = nameToPg.get(key) || null
  if (named) return named

  // Tree Tier sync often leaves Parent Name filled with a person not yet in
  // the DB. Prefer scraped / viewed parent so Workspace stays root-only.
  const scrapedParent = readOriginalViewedParentPg(row.original_data)
  if (scrapedParent) return scrapedParent
  const existing = normalizePgCodeValue(row.parent_pg_code)
  return existing || null
}

/**
 * After cloud/extension sync: fill parent_pg_code for a user's customers.
 * Safe to re-run; only updates rows when a new parent can be resolved and differs.
 */
export async function stampParentPgCodesForUser(
  admin: SupabaseClient,
  userId: string,
  rootPgCode: string
): Promise<{ scanned: number; updated: number; skipped: number }> {
  const root = normalizePgCodeValue(rootPgCode)
  if (!userId || !root) {
    return { scanned: 0, updated: 0, skipped: 0 }
  }

  const pageSize = 1000
  let offset = 0
  const rows: CustomerStampRow[] = []

  while (true) {
    const { data, error } = await admin
      .from('customers')
      .select('id, pg_code, name, parent_pg_code, original_data')
      .eq('user_id', userId)
      .range(offset, offset + pageSize - 1)

    if (error) throw error
    const batch = (data ?? []) as CustomerStampRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
    offset += pageSize
  }

  const nameToPg = new Map<string, string>()
  for (const row of rows) {
    const pg = normalizePgCodeValue(row.pg_code)
    const nameKey = normalizePersonName(row.name)
    if (pg && nameKey) nameToPg.set(nameKey, pg)
  }

  // Include the sync-root dealer (Tree Tier / profile) so juniors naming them resolve.
  const { data: profile } = await admin
    .from('profiles')
    .select('pgcode, full_name, name')
    .eq('id', userId)
    .maybeSingle()
  if (profile) {
    const profilePg =
      normalizePgCodeValue(
        (profile as { pgcode?: string | null }).pgcode
      ) || root
    const profileName = normalizePersonName(
      (profile as { full_name?: string | null }).full_name
    )
    if (profilePg && profileName) nameToPg.set(profileName, profilePg)
  }

  let updated = 0
  let skipped = 0

  for (const row of rows) {
    const nextParent = resolveParentPgCodeForRow(row, nameToPg, root)
    if (!nextParent) {
      skipped += 1
      continue
    }
    const current = normalizePgCodeValue(row.parent_pg_code)
    if (current === nextParent) {
      skipped += 1
      continue
    }

    const originalData =
      row.original_data &&
      typeof row.original_data === 'object' &&
      !Array.isArray(row.original_data)
        ? { ...(row.original_data as Record<string, unknown>) }
        : {}
    originalData['Parent PGCode'] = nextParent

    const { error } = await admin
      .from('customers')
      .update({
        parent_pg_code: nextParent,
        original_data: originalData,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id)
      .eq('user_id', userId)

    if (error) throw error
    updated += 1
  }

  return { scanned: rows.length, updated, skipped }
}
