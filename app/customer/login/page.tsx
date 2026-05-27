import { redirect } from 'next/navigation'
import { PORTAL_LOGIN_PATH } from '@/app/lib/customer-portal/brand'

export default function CustomerLegacyLoginRedirectPage() {
  redirect(PORTAL_LOGIN_PATH)
}
