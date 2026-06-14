import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { buildSaasMePayload, entitlementsFromMe } from '@/app/lib/saas/entitlements'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
