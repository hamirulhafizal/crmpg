import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { publishPlatformCampaignDefault } from '@/app/lib/campaigns/platform-defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id.trim() : ''
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const result = await publishPlatformCampaignDefault(admin, id)

    return NextResponse.json({
      data: result.defaults,
      tier: result.tier,
      target_users: result.target_users,
      provisioned: result.provisioned,
      synced: result.synced,
      set_to_draft: result.set_to_draft,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to publish default workflow'
    const status = msg.includes('not found') || msg.includes('no workflow') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
