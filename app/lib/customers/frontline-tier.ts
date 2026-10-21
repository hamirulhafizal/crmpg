import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildCustomerNameToPgMap,
  isRootFrontlineCustomer,
  resolveDirectParentPgCode,
  type FrontlineParentRow,
} from '@/app/lib/customers/frontline-parent'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'
import type { CampaignAudienceFilters, FrontlineTierNumber } from '@/app/lib/campaigns/types'

export const FRONTLINE_TIER_NUMBERS = [1, 2, 3, 4] as const

type GraphRow = FrontlineParentRow & { id: string; sender_name?: string | null }

export function normalizeFrontlineTiersFilter(
  filters: Pick<CampaignAudienceFilters, 'frontline_tiers'> | CampaignAudienceFilters | null | undefined
): 'all' | Set<FrontlineTierNumber> {
  const v = filters?.frontline_tiers
  if (v === 'all') return 'all'
  if (Array.isArray(v)) {
    const set = new Set<FrontlineTierNumber>()
    for (const raw of v) {
      const n = Number(raw)
      if (n === 1 || n === 2 || n === 3 || n === 4) set.add(n)
    }
    if (set.size > 0) return set
  }
  return new Set<FrontlineTierNumber>([1])
}

/** True when matching must walk the full tree (not root-frontline-only). */
export function frontlineTiersNeedsFullScan(
  filters: Pick<CampaignAudienceFilters, 'frontline_tiers'> | CampaignAudienceFilters | null | undefined
): boolean {
  const wanted = normalizeFrontlineTiersFilter(filters)
  if (wanted === 'all') return true
  return [...wanted].some((t) => t !== 1)
}

export function frontlineTiersIsDefault(
  filters: Pick<CampaignAudienceFilters, 'frontline_tiers'> | CampaignAudienceFilters | null | undefined
): boolean {
  const wanted = normalizeFrontlineTiersFilter(filters)
  return wanted !== 'all' && wanted.size === 1 && wanted.has(1)
}

export function describeFrontlineTiersFilter(
  filters: Pick<CampaignAudienceFilters, 'frontline_tiers'> | CampaignAudienceFilters | null | undefined
): string {
  const wanted = normalizeFrontlineTiersFilter(filters)
  if (wanted === 'all') return 'Tree tier: all (entire tree under you)'
  const list = [...wanted].sort((a, b) => a - b)
  if (list.length === 1 && list[0] === 1) return 'Tree tier: 1 (direct frontline)'
  return `Tree tier: ${list.join(', ')}`
}

export function customerMatchesFrontlineTiers(
  customerId: string,
  filters: Pick<CampaignAudienceFilters, 'frontline_tiers'> | CampaignAudienceFilters | null | undefined,
  tierByCustomerId: Map<string, number>
): boolean {
  const wanted = normalizeFrontlineTiersFilter(filters)
  const tier = tierByCustomerId.get(customerId)
  if (tier == null || tier < 1) return false
  if (wanted === 'all') return true
  if (tier > 4) return false
  return wanted.has(tier as FrontlineTierNumber)
}

/**
 * Hop count from the logged-in dealer (tier 0) using the same parent rules as Direct frontline.
 * Direct frontline = 1, their frontline = 2, and so on.
 */
function graphRowForParent(row: GraphRow): FrontlineParentRow {
  return {
    pg_code: row.pg_code,
    name: row.sender_name || row.name,
    parent_pg_code: row.parent_pg_code,
    original_data: row.original_data,
  }
}

export function buildFrontlineTierByCustomerId(
  rows: GraphRow[],
  rootPgCode: string,
  extras?: { profileName?: string | null }
): Map<string, number> {
  const root = normalizePgCodeValue(rootPgCode)
  if (!root) return new Map()

  const nameToPg = buildCustomerNameToPgMap(
    rows.map((row) => ({ pg_code: row.pg_code, name: row.sender_name || row.name })),
    {
      profilePg: root,
      profileName: extras?.profileName ?? undefined,
    }
  )

  const childrenByParentPg = new Map<string, GraphRow[]>()
  for (const row of rows) {
    const parentRow = graphRowForParent(row)
    let parent = resolveDirectParentPgCode(parentRow, nameToPg, root)
    // Direct frontline often has null parent_pg_code (column is null under the dealer).
    if (!parent && isRootFrontlineCustomer(parentRow, root)) parent = root
    if (!parent) continue
    const list = childrenByParentPg.get(parent) ?? []
    list.push(row)
    childrenByParentPg.set(parent, list)
  }

  const out = new Map<string, number>()
  let frontier = [root]
  const seenPg = new Set<string>([root])
  let depth = 0
  while (frontier.length > 0 && depth < 64) {
    const next: string[] = []
    for (const parentPg of frontier) {
      for (const child of childrenByParentPg.get(parentPg) ?? []) {
        const childTier = depth + 1
        if (!out.has(child.id)) out.set(child.id, childTier)
        const childPg = normalizePgCodeValue(child.pg_code)
        if (childPg && !seenPg.has(childPg)) {
          seenPg.add(childPg)
          next.push(childPg)
        }
      }
    }
    frontier = next
    depth += 1
  }
  return out
}

const GRAPH_SELECT = 'id, pg_code, name, sender_name, parent_pg_code, original_data'
const GRAPH_PAGE = 1000

async function loadFrontlineGraphRows(
  supabase: SupabaseClient,
  userId: string
): Promise<GraphRow[]> {
  const rows: GraphRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('customers')
      .select(GRAPH_SELECT)
      .eq('user_id', userId)
      .range(from, from + GRAPH_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as GraphRow[]
    if (batch.length === 0) break
    rows.push(...batch)
    from += GRAPH_PAGE
    if (batch.length < GRAPH_PAGE) break
  }
  return rows
}

export async function loadFrontlineTierByCustomerId(
  supabase: SupabaseClient,
  userId: string,
  rootPgCode: string,
  extras?: { profileName?: string | null }
): Promise<Map<string, number>> {
  const rows = await loadFrontlineGraphRows(supabase, userId)
  return buildFrontlineTierByCustomerId(rows, rootPgCode, extras)
}

function shouldKeepAsDirectFrontline(
  row: GraphRow,
  rootPgCode: string,
  tierByCustomerId: Map<string, number>
): boolean {
  const root = normalizePgCodeValue(rootPgCode)
  const pg = normalizePgCodeValue(row.pg_code)
  if (root && pg && pg === root) return true
  const tier = tierByCustomerId.get(row.id)
  if (tier === 1) return true
  if (tier != null && tier >= 2) return false
  return isRootFrontlineCustomer(graphRowForParent(row), root)
}

/** IDs below direct frontline (tier 2+ and unresolved nested). Tier 1 is kept. */
export async function listNestedTierCustomerIds(
  supabase: SupabaseClient,
  userId: string
): Promise<{ rootPgCode: string; keepCount: number; deleteIds: string[] }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('pgcode, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) {
    throw new Error(`Could not load dealer PG code: ${profileError.message}`)
  }
  const rootPgCode = normalizePgCodeValue(
    (profile as { pgcode?: string | null } | null)?.pgcode
  )
  if (!rootPgCode) {
    throw new Error('Your profile has no PG code, so nested tiers cannot be resolved.')
  }
  const profileName =
    (profile as { full_name?: string | null } | null)?.full_name || null
  const rows = await loadFrontlineGraphRows(supabase, userId)
  const tierByCustomerId = buildFrontlineTierByCustomerId(rows, rootPgCode, { profileName })
  const deleteIds: string[] = []
  let keepCount = 0
  for (const row of rows) {
    if (shouldKeepAsDirectFrontline(row, rootPgCode, tierByCustomerId)) {
      keepCount++
    } else {
      deleteIds.push(row.id)
    }
  }
  return { rootPgCode, keepCount, deleteIds }
}

export type CustomerTreePlacement = {
  tree_tier: number | null
  parent_pg_code: string | null
  parent_name: string | null
  parent_customer_id: string | null
  is_dealer: boolean
}

export function describeCustomerTreeTier(
  tier: number | null | undefined,
  isDealer?: boolean
): string {
  if (isDealer || tier === 0) return 'You (dealer)'
  if (tier == null || !Number.isFinite(tier) || tier < 1) return 'Unknown'
  if (tier === 1) return 'Tier 1 — Direct frontline'
  return `Tier ${tier}`
}

function readNamedParentForLookup(originalData: unknown): string {
  if (!originalData || typeof originalData !== 'object' || Array.isArray(originalData)) {
    return ''
  }
  const rec = originalData as Record<string, unknown>
  const raw = rec['Parent Name'] ?? rec.parent_name
  const name = String(raw ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!name) return ''
  const lower = name.toLowerCase()
  if (lower === '-' || lower === '—' || lower === '–' || lower === 'n/a') return ''
  return name
}

function displayPersonName(row: {
  save_name?: string | null
  sender_name?: string | null
  name?: string | null
}): string | null {
  const v = row.sender_name || row.name || row.save_name
  const t = String(v ?? '').replace(/\s{2,}/g, ' ').trim()
  return t || null
}

function toGraphRow(row: {
  id?: string | null
  pg_code?: string | null
  name?: string | null
  sender_name?: string | null
  parent_pg_code?: string | null
  original_data?: unknown
}): GraphRow {
  return {
    id: String(row.id || ''),
    pg_code: row.pg_code ?? null,
    name: row.name ?? null,
    sender_name: row.sender_name ?? null,
    parent_pg_code: row.parent_pg_code ?? null,
    original_data: row.original_data ?? null,
  }
}

const PARENT_LOOKUP_SELECT =
  'id, pg_code, name, sender_name, save_name, parent_pg_code, original_data'

async function lookupCustomerByPg(
  supabase: SupabaseClient,
  userId: string,
  pgCode: string
): Promise<(GraphRow & { save_name?: string | null }) | null> {
  const pg = normalizePgCodeValue(pgCode)
  if (!pg) return null
  const exact = await supabase
    .from('customers')
    .select(PARENT_LOOKUP_SELECT)
    .eq('user_id', userId)
    .eq('pg_code', pg)
    .maybeSingle()
  if (!exact.error && exact.data) {
    return exact.data as GraphRow & { save_name?: string | null }
  }
  const { data } = await supabase
    .from('customers')
    .select(PARENT_LOOKUP_SELECT)
    .eq('user_id', userId)
    .ilike('pg_code', pg)
    .limit(1)
  const row = Array.isArray(data) ? data[0] : data
  return (row as (GraphRow & { save_name?: string | null }) | null) ?? null
}

async function lookupPgByPersonName(
  supabase: SupabaseClient,
  userId: string,
  personName: string
): Promise<string> {
  const name = personName.replace(/\s{2,}/g, ' ').trim()
  if (!name || /[%_,()]/.test(name)) return ''
  const tryCol = async (column: 'sender_name' | 'name') => {
    const { data } = await supabase
      .from('customers')
      .select('pg_code')
      .eq('user_id', userId)
      .ilike(column, name)
      .not('pg_code', 'is', null)
      .limit(1)
    const row = Array.isArray(data) ? data[0] : data
    return normalizePgCodeValue((row as { pg_code?: string | null } | null)?.pg_code)
  }
  return (await tryCol('sender_name')) || (await tryCol('name')) || ''
}

async function resolveImmediateParentPg(
  supabase: SupabaseClient,
  userId: string,
  row: GraphRow,
  rootPg: string,
  nameToPg: Map<string, string>
): Promise<string> {
  const parentRow = graphRowForParent(row)
  let parent = resolveDirectParentPgCode(parentRow, nameToPg, rootPg) || ''
  if (parent) return parent

  const named = readNamedParentForLookup(row.original_data)
  if (named) {
    const byName = nameToPg.get(named.toUpperCase()) || (await lookupPgByPersonName(supabase, userId, named))
    if (byName) {
      nameToPg.set(named.toUpperCase(), byName)
      return byName
    }
    return ''
  }

  if (rootPg && isRootFrontlineCustomer(parentRow, rootPg)) return rootPg
  return ''
}

/**
 * Hop count from the logged-in dealer plus the immediate upline PG.
 * Same parent rules as audience / Direct frontline. Not persisted.
 */
export async function resolveCustomerTreePlacement(
  supabase: SupabaseClient,
  userId: string,
  customer: {
    id?: string | null
    pg_code?: string | null
    name?: string | null
    sender_name?: string | null
    save_name?: string | null
    parent_pg_code?: string | null
    original_data?: unknown
  }
): Promise<CustomerTreePlacement> {
  const empty: CustomerTreePlacement = {
    tree_tier: null,
    parent_pg_code: null,
    parent_name: null,
    parent_customer_id: null,
    is_dealer: false,
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('pgcode, full_name')
    .eq('id', userId)
    .maybeSingle()

  const rootPg = normalizePgCodeValue(
    (profile as { pgcode?: string | null } | null)?.pgcode
  )
  const profileName =
    String((profile as { full_name?: string | null } | null)?.full_name ?? '')
      .replace(/\s{2,}/g, ' ')
      .trim() || null
  const self = toGraphRow(customer)
  const selfPg = normalizePgCodeValue(self.pg_code)

  if (rootPg && selfPg && selfPg === rootPg) {
    return {
      tree_tier: 0,
      parent_pg_code: null,
      parent_name: null,
      parent_customer_id: null,
      is_dealer: true,
    }
  }

  const nameToPg = new Map<string, string>()
  if (rootPg && profileName) nameToPg.set(profileName.toUpperCase(), rootPg)

  const parentPg = await resolveImmediateParentPg(supabase, userId, self, rootPg, nameToPg)
  if (!parentPg) return empty

  let treeTier: number | null = null
  if (rootPg && parentPg === rootPg) {
    treeTier = 1
  } else {
    let hops = 1
    let cursor = parentPg
    const seen = new Set<string>([selfPg, parentPg].filter(Boolean))
    while (cursor && rootPg && cursor !== rootPg && hops < 64) {
      const ancestor = await lookupCustomerByPg(supabase, userId, cursor)
      if (!ancestor) break
      const next = await resolveImmediateParentPg(supabase, userId, ancestor, rootPg, nameToPg)
      if (!next) break
      if (seen.has(next)) break
      seen.add(next)
      cursor = next
      hops += 1
    }
    if (rootPg && cursor === rootPg) treeTier = hops
  }

  let parentName: string | null = null
  let parentCustomerId: string | null = null
  if (rootPg && parentPg === rootPg) {
    parentName = profileName ? `You · ${profileName}` : 'You'
  } else {
    const parentRow = await lookupCustomerByPg(supabase, userId, parentPg)
    if (parentRow) {
      parentCustomerId = parentRow.id || null
      parentName = displayPersonName(parentRow)
    }
  }

  return {
    tree_tier: treeTier,
    parent_pg_code: parentPg,
    parent_name: parentName,
    parent_customer_id: parentCustomerId,
    is_dealer: false,
  }
}

export async function resolveAudienceFrontlineScope(
  supabase: SupabaseClient,
  userId: string,
  filters: CampaignAudienceFilters
): Promise<{ rootPgCode: string; tierByCustomerId?: Map<string, number> }> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('pgcode, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) {
    throw new Error(`Could not load dealer PG code: ${profileError.message}`)
  }
  const rootPgCode = normalizePgCodeValue(
    (profile as { pgcode?: string | null } | null)?.pgcode
  )
  const profileName =
    (profile as { full_name?: string | null } | null)?.full_name || null

  if (!frontlineTiersNeedsFullScan(filters) || !rootPgCode) {
    return { rootPgCode }
  }

  const tierByCustomerId = await loadFrontlineTierByCustomerId(supabase, userId, rootPgCode, {
    profileName,
  })
  return { rootPgCode, tierByCustomerId }
}
