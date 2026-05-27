import { redirect } from 'next/navigation'
import { getCustomerIdFromPortalCookie } from '@/app/lib/customer-portal/session'
import { PORTAL_LOGIN_PATH, PORTAL_PROFILE_PATH } from '@/app/lib/customer-portal/brand'

export default async function PgGoldSaverIndexPage() {
  const customerId = await getCustomerIdFromPortalCookie()
  if (customerId) {
    redirect(PORTAL_PROFILE_PATH)
  }
  redirect(PORTAL_LOGIN_PATH)
}
