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

function readScrapedParentPg(originalData: unknown): string {
  const data = asOriginalRecord(originalData)
  if (!data) return ''
  return (
    normalizePgCodeValue(data['Parent PGCode']) ||
    normalizePgCodeValue(data.parent_pg_code) ||
    normalizePgCodeValue(data._viewed_pg_code) ||
    ''
  )
}

export type FrontlineParentRow = {
  pg_code: string | null
  name: string | null
  parent_pg_code?: string | null
  original_data: unknown
}

/** Name → PG map for resolving BC Parent Name to a dealer PG. */
export function buildCustomerNameToPgMap(
  rows: Pick<FrontlineParentRow, 'pg_code' | 'name'>[],
  extras?: { profilePg?: string; profileName?: string }
): Map<string, string> {
  const nameToPg = new Map<string, string>()
  for (const row of rows) {
    const pg = normalizePgCodeValue(row.pg_code)
    const nameKey = normalizePersonName(row.name)
    if (pg && nameKey) nameToPg.set(nameKey, pg)
  }
  const profilePg = normalizePgCodeValue(extras?.profilePg)
  const profileName = normalizePersonName(extras?.profileName)
  if (profilePg && profileName) nameToPg.set(profileName, profilePg)
  return nameToPg
}

/**
 * Resolve the immediate parent PG for frontline listing.
 *
 * Important: blank Parent Name ("-") must NOT be attributed to whatever dealer
 * the UI is currently viewing. That was causing Mos's eye to show the whole
 * root list after bad / partial syncs.
 *
 * Rules:
 * 1. explicit Parent PGCode / _viewed_pg_code in original_data
 * 2. parent_pg_code column
 * 3. named Parent Name → name map
 * 4. blank Parent Name with no explicit parent → root only (if known)
 */
export function resolveDirectParentPgCode(
  row: FrontlineParentRow,
  nameToPg: Map<string, string>,
  rootPgCode: string
): string | null {
  const scraped = readScrapedParentPg(row.original_data)
  if (scraped) return scraped

  const columnParent = normalizePgCodeValue(row.parent_pg_code)
  if (columnParent) return columnParent

  const parentName = readOriginalParentName(row.original_data)
  if (parentName == null) return null

  if (!isBlankParentName(parentName)) {
    return nameToPg.get(normalizePersonName(parentName)) || null
  }

  // Blank Parent Name and no explicit Parent PG → belongs to sync root only.
  return normalizePgCodeValue(rootPgCode) || null
}

/**
 * Workspace Customers tab: only the logged-in dealer's direct frontline.
 * Hide anyone explicitly parented to a nested dealer (e.g. Mos PG00192201).
 * Legacy rows with blank/missing Parent Name and no parent link still show.
 * Named Parent Name with no parent PG link is treated as nested/incomplete
 * (Mos Tree Tier sync orphans) — hide from Workspace until stamped.
 */
export function isRootFrontlineCustomer(
  row: FrontlineParentRow,
  rootPgCode: string
): boolean {
  const root = normalizePgCodeValue(rootPgCode)
  if (!root) return true

  const scraped = readScrapedParentPg(row.original_data)
  const columnParent = normalizePgCodeValue(row.parent_pg_code)

  if (scraped && scraped !== root) return false
  if (columnParent && columnParent !== root) return false

  // Unresolved named parent + no parent PG → not root frontline.
  if (!scraped && !columnParent) {
    const parentName = readOriginalParentName(row.original_data)
    if (parentName != null && !isBlankParentName(parentName)) {
      return false
    }
  }

  return true
}

export function isDirectFrontlineOf(
  row: FrontlineParentRow,
  parentPgCode: string,
  nameToPg: Map<string, string>,
  rootPgCode: string
): boolean {
  const target = normalizePgCodeValue(parentPgCode)
  if (!target) return false

  const scraped = readScrapedParentPg(row.original_data)
  const columnParent = normalizePgCodeValue(row.parent_pg_code)
  const parentName = readOriginalParentName(row.original_data)
  const root = normalizePgCodeValue(rootPgCode)
  const viewingRoot = Boolean(root && target === root)

  // Explicit scraped / column link to this node.
  if (scraped && scraped === target) return true
  if (columnParent && columnParent === target) return true

  // Named parent resolves to this node.
  if (parentName != null && !isBlankParentName(parentName)) {
    const named = nameToPg.get(normalizePersonName(parentName))
    return Boolean(named && named === target)
  }

  // Blank Parent Name with no explicit parent PG:
  // only count under root — never invent a nested parent (e.g. Mos).
  if (parentName != null && isBlankParentName(parentName)) {
    if (scraped || columnParent) return false
    return viewingRoot
  }

  return false
}
