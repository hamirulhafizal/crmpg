import { redirect } from 'next/navigation'

/** Old path — keep bookmark/deep-link compatibility. */
export default function WahaIntegrationRedirectPage() {
  redirect('/ws-integration')
}
