import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildFrontlineTreeIndex,
  type FrontlineGraphRow,
} from '@/app/lib/customers/frontline-tier'
import {
  buildGoogleContactSaveName,
  collapsePersonName,
} from '@/app/lib/customers/google-contact-name'
import { normalizePgCodeValue } from '@/app/lib/customers/pg-code'

const IMPORT_SELECT =
  'id, name, dob, email, phone, first_name, sender_name, save_name, pg_code, parent_pg_code, original_data'
const IMPORT_PAGE = 1000
const GOOGLE_IMPORT_TIERS = new Set([1, 2, 3, 4])

type ImportGraphRow = FrontlineGraphRow & {
  dob?: string | null
  email?: string | null
  phone?: string | null
  first_name?: string | null
  save_name?: string | null
}

export type GoogleContactImportRow = {
  Name: string
  SenderName: string
  FirstName: string
  SaveName: string
  DOB: string
  Email: string
  Phone: string
}

export type GoogleContactImportResult = {
  data: GoogleContactImportRow[]
  counts: {
    total: number
    t1: number
    t2: number
    t3: number
    t4: number
  }
}

function asText(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

function senderLabel(row: Pick<ImportGraphRow, 'sender_name' | 'name'>): string {
  return collapsePersonName(row.sender_name || row.name)
}

async function loadImportGraphRows(
  supabase: SupabaseClient,
  userId: string
): Promise<ImportGraphRow[]> {
  const rows: ImportGraphRow[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('customers')
      .select(IMPORT_SELECT)
      .eq('user_id', userId)
      .range(from, from + IMPORT_PAGE - 1)
    if (error) throw error
    const batch = (data ?? []) as ImportGraphRow[]
    if (batch.length === 0) break
    rows.push(...batch)
    from += IMPORT_PAGE
    if (batch.length < IMPORT_PAGE) break
  }
  return rows
}

export async function loadGoogleContactImportRows(
  supabase: SupabaseClient,
  userId: string
): Promise<GoogleContactImportResult> {
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('pgcode, full_name')
    .eq('id', userId)
    .maybeSingle()
  if (profileError) {
    throw new Error(`Could not load dealer PG code: ${profileError.message}`)
  }

  const rootPg = normalizePgCodeValue(
    (profile as { pgcode?: string | null } | null)?.pgcode
  )
  const profileName =
    collapsePersonName((profile as { full_name?: string | null } | null)?.full_name) || null

  const rows = await loadImportGraphRows(supabase, userId)
  const index = buildFrontlineTreeIndex(rows, rootPg, { profileName })

  const senderByPg = new Map<string, string>()
  for (const row of rows) {
    const pg = normalizePgCodeValue(row.pg_code)
    const label = senderLabel(row)
    if (pg && label && !senderByPg.has(pg)) senderByPg.set(pg, label)
  }

  const counts = { total: 0, t1: 0, t2: 0, t3: 0, t4: 0 }
  const data: GoogleContactImportRow[] = []

  for (const row of rows) {
    const tier = index.tierByCustomerId.get(row.id)
    if (tier == null || !GOOGLE_IMPORT_TIERS.has(tier)) continue

    const parentPg = index.parentPgByCustomerId.get(row.id) || ''
    const parentSender =
      tier >= 2 && parentPg && parentPg !== rootPg ? senderByPg.get(parentPg) || '' : ''

    const saveName = buildGoogleContactSaveName({
      saveName: row.save_name,
      senderName: row.sender_name,
      pgCode: row.pg_code,
      treeTier: tier,
      parentSenderName: parentSender,
    })
    if (!saveName) continue

    if (tier === 1) counts.t1 += 1
    else if (tier === 2) counts.t2 += 1
    else if (tier === 3) counts.t3 += 1
    else counts.t4 += 1
    counts.total += 1

    data.push({
      Name: asText(row.name),
      SenderName: asText(row.sender_name),
      FirstName: asText(row.first_name),
      SaveName: saveName,
      DOB: asText(row.dob),
      Email: asText(row.email),
      Phone: asText(row.phone),
    })
  }

  return { data, counts }
}
