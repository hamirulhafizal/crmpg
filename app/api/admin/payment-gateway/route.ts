import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'

/**
 * Safe, read-only snapshot of Bayarcash-related env for admin UI.
 * Never returns secret values — only booleans and non-sensitive flags.
 */
export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const apiBase = (process.env.BAYARCASH_API_BASE || '').trim() || null
  const sandbox = process.env.BAYARCASH_SANDBOX === 'true'
  const paymentChannel = (process.env.BAYARCASH_PAYMENT_CHANNEL || '').trim() || null
  const googleAdsRenewalIntegration = process.env.CRM_BAYARCASH_RENEWAL === 'true'

  const pat = (process.env.BAYARCASH_PAT || '').trim()
  const secret = (process.env.BAYARCASH_SECRET || '').trim()
  const portalKey = (process.env.BAYARCASH_PORTAL_KEY || '').trim()

  const personalAccessToken = pat.length > 0
  const apiSecret = secret.length > 0
  const portalKeySet = portalKey.length > 0

  const fullyConfigured = Boolean(apiBase && personalAccessToken && apiSecret && portalKeySet)

  return NextResponse.json({
    provider: 'bayarcash' as const,
    apiBase,
    sandbox,
    paymentChannel,
    googleAdsRenewalIntegration,
    credentialsConfigured: {
      personalAccessToken,
      apiSecret,
      portalKey: portalKeySet,
    },
    fullyConfigured,
  })
}
