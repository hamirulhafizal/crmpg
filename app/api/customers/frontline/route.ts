import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { getAccountStatusKey } from '@/app/lib/customer-account-status'
import {
  buildCustomerNameToPgMap,
  isDirectFrontlineOf,
  resolveDirectParentPgCode,
} from '@/app/lib/customers/frontline-parent'
import { hasRealPgCode, normalizePgCodeValue } from '@/app/lib/customers/pg-code'

const noStoreHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
  Pragma: 'no-cache',
  Expires: '0',
  'Surrogate-Control': 'no-store',
}

const FRONTLINE_SELECT =
  'id, name, dob, email, phone, location, gender, ethnicity, age, prefix, first_name, sender_name, save_name, pg_code, parent_pg_code, original_data, is_married, is_friend, created_at, updated_at, last_purchase_at, is_monthly_buyer, segment_attributes, phone_contact_status'

type PathNode = {
  id: string | null
  pg_code: string
  name: string
}

function displayName(row: {
  sender_name?: string | null
  name?: string | null
  pg_code?: string | null
}): string {
  return (
    row.sender_name?.trim() ||
    row.name?.trim() ||
    normalizePgCodeValue(row.pg_code) ||
    'Unknown'
  )
}

/**
 * GET /api/customers/frontline?parent_pg_code=&page=&limit=&search=
 * Direct frontline of a node (parent_pg_code match). Excludes Temporary (no real PG).
 */
export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: noStoreHeaders })
    }
    const { user, supabase } = auth

    const { searchParams } = new URL(request.url)
    const parentPgCode = normalizePgCodeValue(searchParams.get('parent_pg_code'))
    if (!parentPgCode) {
      return NextResponse.json(
        { error: 'parent_pg_code is required' },
        { status: 400, headers: noStoreHeaders }
      )
    }

    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1)
    const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 50) || 50))
    const search = (searchParams.get('search') || '').trim()

    const { data: profile } = await supabase
      .from('profiles')
      .select('pgcode, full_name, name')
      .eq('id', user.id)
      .maybeSingle()

    const rootPgCode = normalizePgCodeValue(profile?.pgcode)
    const profileName =
      (profile as { full_name?: string | null; name?: string | null } | null)
        ?.full_name ||
      (profile as { name?: string | null } | null)?.name ||
      null

    const { data: parentRow } = await supabase
      .from('customers')
      .select('id, name, sender_name, pg_code, parent_pg_code, original_data')
      .eq('user_id', user.id)
      .ilike('pg_code', parentPgCode)
      .maybeSingle()

    // Load customers once, then resolve direct frontline from BC rules
    // (Parent Name + Parent PGCode in original_data — not parent_pg_code column alone).
    const pageSize = 1000
    let from = 0
    const allCustomers: Record<string, unknown>[] = []

    for (;;) {
      const { data: batch, error } = await supabase
        .from('customers')
        .select(FRONTLINE_SELECT)
        .eq('user_id', user.id)
        .order('sender_name', { ascending: true, nullsFirst: false })
        .range(from, from + pageSize - 1)

      if (error) {
        if (isMissingParentPgColumn(error.message)) {
          return NextResponse.json(
            {
              data: [],
              total: 0,
              totalPages: 1,
              parent: {
                id: parentRow?.id ?? null,
                pg_code: parentPgCode,
                name: parentRow ? displayName(parentRow) : parentPgCode,
              },
              root_pg_code: rootPgCode || null,
              path: [],
              ratios: { total: 0, active: 0, inactive_free: 0 },
              parent_pg_linked: false,
              message:
                'parent_pg_code column is not available yet. Apply migration 068, then sync parent PG from BC.',
            },
            { headers: noStoreHeaders }
          )
        }
        console.error('GET /api/customers/frontline:', error)
        return NextResponse.json({ error: error.message }, { status: 500, headers: noStoreHeaders })
      }

      if (!batch?.length) break
      allCustomers.push(...batch)
      if (batch.length < pageSize) break
      from += pageSize
    }

    const nameToPg = buildCustomerNameToPgMap(
      allCustomers as { pg_code: string | null; name: string | null }[],
      { profilePg: rootPgCode, profileName: profileName ?? undefined }
    )

    const path = await buildTreePath({
      supabase,
      userId: user.id,
      nodePgCode: parentPgCode,
      nodeRow: parentRow,
      rootPgCode,
      nameToPg,
      rowByPg: buildRowByPgMap(allCustomers),
    })

    const columnOnlyCount = allCustomers.filter(
      (row) =>
        hasRealPgCode(row.pg_code) &&
        normalizePgCodeValue(row.parent_pg_code) === parentPgCode
    ).length

    // Never fall back parentPgCode as "root" — that made Mos inherit every
    // blank Parent Name row (looked like the whole root frontline).
    let directChildren = allCustomers.filter((row) =>
      isDirectFrontlineOf(
        row as {
          pg_code: string | null
          name: string | null
          parent_pg_code?: string | null
          original_data: unknown
        },
        parentPgCode,
        nameToPg,
        rootPgCode
      )
    )

    if (search) {
      const q = search.toLowerCase()
      directChildren = directChildren.filter((row) => {
        const fields = [
          row.name,
          row.sender_name,
          row.email,
          row.phone,
          row.pg_code,
        ]
        return fields.some(
          (v) => typeof v === 'string' && v.toLowerCase().includes(q)
        )
      })
    }

    const eligible = directChildren.filter((row) => hasRealPgCode(row.pg_code))

    let active = 0
    let inactiveFree = 0
    for (const row of eligible) {
      const key = getAccountStatusKey(row)
      if (key === 'active') active += 1
      else inactiveFree += 1
    }

    const total = eligible.length
    const totalPages = Math.max(1, Math.ceil(total / limit))
    const start = (page - 1) * limit
    const data = eligible.slice(start, start + limit)

    const linkedCount = allCustomers.filter((row) =>
      Boolean(normalizePgCodeValue(row.parent_pg_code))
    ).length

    const dataQualityHint =
      columnOnlyCount > total && total > 0 && columnOnlyCount > total * 1.5
        ? `Some records were linked to the wrong parent during an earlier sync. Showing ${total.toLocaleString()} resolved frontline for this dealer. Re-sync their Tree Tier in BC (extension → Sync open Tree Tier) to refresh.`
        : columnOnlyCount > 0 && total === 0
          ? 'Parent links look inconsistent. Re-sync this dealer’s Tree Tier from Business Center, then run parent PG stamp if needed.'
          : null

    return NextResponse.json(
      {
        data,
        total,
        totalPages,
        page,
        limit,
        parent: {
          id: parentRow?.id ?? null,
          pg_code: parentPgCode,
          name: parentRow ? displayName(parentRow) : parentPgCode,
        },
        root_pg_code: rootPgCode || null,
        path,
        ratios: {
          total,
          active,
          inactive_free: inactiveFree,
        },
        parent_pg_linked: linkedCount > 0,
        column_match_total: columnOnlyCount,
        message:
          total === 0 && linkedCount === 0
            ? 'No parent PG links yet. Sync parent_pg_code from PG Business Center to populate frontline.'
            : dataQualityHint,
      },
      { headers: noStoreHeaders }
    )
  } catch (err: unknown) {
    console.error('GET /api/customers/frontline:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Internal server error' },
      { status: 500, headers: noStoreHeaders }
    )
  }
}

function isMissingParentPgColumn(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('parent_pg_code') && (m.includes('does not exist') || m.includes('column'))
}

type TreePathRow = {
  id: string
  name: string | null
  sender_name: string | null
  pg_code: string | null
  parent_pg_code: string | null
  original_data: unknown
}

function buildRowByPgMap(
  rows: Record<string, unknown>[]
): Map<string, TreePathRow> {
  const map = new Map<string, TreePathRow>()
  for (const row of rows) {
    const pg = normalizePgCodeValue(row.pg_code)
    if (!pg) continue
    map.set(pg, row as TreePathRow)
  }
  return map
}

async function buildTreePath(args: {
  supabase: SupabaseClient
  userId: string
  nodePgCode: string
  nodeRow: TreePathRow | null
  rootPgCode: string
  nameToPg: Map<string, string>
  rowByPg: Map<string, TreePathRow>
}): Promise<PathNode[]> {
  const { supabase, userId, nodePgCode, nodeRow, rootPgCode, nameToPg, rowByPg } =
    args
  const path: PathNode[] = []
  const seen = new Set<string>()

  let currentPg = nodePgCode
  let currentRow = nodeRow
  let guard = 0

  while (currentPg && !seen.has(currentPg) && guard < 32) {
    seen.add(currentPg)
    guard += 1

    if (!currentRow) {
      currentRow = rowByPg.get(currentPg) ?? null
    }
    if (!currentRow) {
      const { data } = await supabase
        .from('customers')
        .select('id, name, sender_name, pg_code, parent_pg_code, original_data')
        .eq('user_id', userId)
        .ilike('pg_code', currentPg)
        .maybeSingle()
      currentRow = data as TreePathRow | null
    }

    path.unshift({
      id: currentRow?.id ?? null,
      pg_code: currentPg,
      name: currentRow ? displayName(currentRow) : currentPg,
    })

    if (rootPgCode && currentPg === rootPgCode) break

    const parentPg = currentRow
      ? resolveDirectParentPgCode(currentRow, nameToPg, rootPgCode)
      : null
    if (!parentPg) break

    currentPg = parentPg
    currentRow = null
  }

  if (rootPgCode && (path.length === 0 || path[0]?.pg_code !== rootPgCode)) {
    const alreadyHasRoot = path.some((p) => p.pg_code === rootPgCode)
    if (!alreadyHasRoot) {
      const rootCustomer =
        rowByPg.get(rootPgCode) ??
        (
          await supabase
            .from('customers')
            .select('id, name, sender_name, pg_code')
            .eq('user_id', userId)
            .ilike('pg_code', rootPgCode)
            .maybeSingle()
        ).data

      path.unshift({
        id: rootCustomer?.id ?? null,
        pg_code: rootPgCode,
        name: rootCustomer ? displayName(rootCustomer) : rootPgCode,
      })
    }
  }

  return path
}
