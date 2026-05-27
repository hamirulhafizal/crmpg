import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { phonesMatch } from '@/app/lib/customer-portal/phone'

export type PortalCustomerRow = {
  id: string
  user_id: string
  name: string | null
  dob: string | null
  email: string | null
  phone: string | null
  location: string | null
  pg_code: string | null
  gender: string | null
  ethnicity: string | null
  sender_name: string | null
  save_name: string | null
}

const PORTAL_SELECT =
  'id, user_id, name, dob, email, phone, location, pg_code, gender, ethnicity, sender_name, save_name'

export function normalizePgCodeInput(raw: string): string {
  return raw.trim()
}

export type LookupResult =
  | { ok: true; customer: PortalCustomerRow }
  | { ok: false; reason: 'not_found' | 'ambiguous' | 'no_phone' }

export async function lookupCustomerByPgCode(pgCodeRaw: string): Promise<LookupResult> {
  const pgCode = normalizePgCodeInput(pgCodeRaw)
  if (!pgCode) return { ok: false, reason: 'not_found' }

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('customers')
    .select(PORTAL_SELECT)
    .ilike('pg_code', pgCode)

  if (error) throw error
  const rows = (data ?? []) as PortalCustomerRow[]
  const exact = rows.filter((r) => (r.pg_code || '').trim().toLowerCase() === pgCode.toLowerCase())
  if (exact.length === 0) return { ok: false, reason: 'not_found' }
  if (exact.length > 1) return { ok: false, reason: 'ambiguous' }
  return { ok: true, customer: exact[0]! }
}

export async function lookupCustomerByPhone(phoneRaw: string): Promise<LookupResult> {
  const trimmed = phoneRaw.trim()
  if (!trimmed) return { ok: false, reason: 'not_found' }

  const admin = createServiceRoleClient()
  const suffix = trimmed.replace(/[^0-9]/g, '').slice(-9)
  if (suffix.length < 8) return { ok: false, reason: 'not_found' }

  const { data, error } = await admin
    .from('customers')
    .select(PORTAL_SELECT)
    .not('phone', 'is', null)
    .or(`phone.ilike.%${suffix}%`)

  if (error) throw error
  const rows = ((data ?? []) as PortalCustomerRow[]).filter((r) => phonesMatch(r.phone, trimmed))
  if (rows.length === 0) return { ok: false, reason: 'not_found' }
  if (rows.length > 1) return { ok: false, reason: 'ambiguous' }
  const customer = rows[0]!
  if (!customer.phone?.trim()) return { ok: false, reason: 'no_phone' }
  return { ok: true, customer }
}
