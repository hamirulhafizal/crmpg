import { redirect } from 'next/navigation'
import { PORTAL_PROFILE_PATH } from '@/app/lib/customer-portal/brand'

export default function CustomerLegacyProfileRedirectPage() {
  redirect(PORTAL_PROFILE_PATH)
}
