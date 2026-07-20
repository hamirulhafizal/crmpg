import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { buildSaasMePayload, entitlementsFromMe } from '@/app/lib/saas/entitlements'

export async function GET(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user } = auth

  try {
    const payload = await buildSaasMePayload(user.id)
    if (!payload) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }
    return NextResponse.json({
      ...payload,
      entitlements: entitlementsFromMe(payload),
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load billing' }, { status: 500 })
  }
}
