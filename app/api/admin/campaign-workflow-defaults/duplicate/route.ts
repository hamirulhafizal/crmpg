import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { duplicatePlatformCampaignDefault } from '@/app/lib/campaigns/platform-defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const name = typeof body.name === 'string' ? body.name.trim() : undefined
    const admin = createServiceRoleClient()
    const result = await duplicatePlatformCampaignDefault(admin, id, { name })

    return NextResponse.json({ data: result.defaults })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to duplicate template'
    const status = msg.includes('not found') ? 404 : 400
    return NextResponse.json({ error: msg }, { status })
  }
}
