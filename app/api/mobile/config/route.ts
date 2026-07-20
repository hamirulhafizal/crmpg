import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'

/**
 * Lightweight mobile bootstrap config.
 * Authenticated so only signed-in dealers can probe the API with Bearer tokens.
 */
export async function GET(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response

  return NextResponse.json({
    ok: true,
    user_id: auth.user.id,
    auth_mode: auth.accessToken ? 'bearer' : 'cookie',
    min_ios_version: '1.0.0',
    api_base: process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || null,
    features: {
      customers: true,
      saas_me: true,
      whatsapp: true,
      campaigns: true,
      push_apns: true,
      billing: true,
    },
  })
}
