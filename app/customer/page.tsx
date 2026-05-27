import { redirect } from 'next/navigation'
import { getCustomerIdFromPortalCookie } from '@/app/lib/customer-portal/session'
import { PORTAL_LOGIN_PATH, PORTAL_PROFILE_PATH } from '@/app/lib/customer-portal/brand'

export default async function CustomerLegacyRedirectPage() {
  const customerId = await getCustomerIdFromPortalCookie()
  redirect(customerId ? PORTAL_PROFILE_PATH : PORTAL_LOGIN_PATH)
}
