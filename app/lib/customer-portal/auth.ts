import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { getCustomerIdFromPortalCookie } from '@/app/lib/customer-portal/session'
import type { PortalCustomerRow } from '@/app/lib/customer-portal/lookup'

const PORTAL_SELECT =
  'id, user_id, name, dob, email, phone, location, pg_code, gender, ethnicity, sender_name, save_name'

export async function getAuthenticatedPortalCustomer(): Promise<PortalCustomerRow | null> {
  const customerId = await getCustomerIdFromPortalCookie()
  if (!customerId) return null

  const admin = createServiceRoleClient()
  const { data, error } = await admin
    .from('customers')
    .select(PORTAL_SELECT)
    .eq('id', customerId)
    .maybeSingle()

  if (error) throw error
  return (data as PortalCustomerRow | null) ?? null
}

export function portalCustomerPublicView(row: PortalCustomerRow) {
  return {
    id: row.id,
    name: row.name,
    dob: row.dob,
    email: row.email,
    phone: row.phone,
    location: row.location,
    pg_code: row.pg_code,
    gender: row.gender,
    ethnicity: row.ethnicity,
    sender_name: row.sender_name,
    save_name: row.save_name,
  }
}
