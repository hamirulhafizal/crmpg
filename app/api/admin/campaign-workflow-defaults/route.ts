import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import {
  countLinkedPlatformDefaultCampaigns,
  loadPlatformCampaignDefault,
  savePlatformCampaignDefaultFromCampaign,
  savePlatformCampaignDefaultFromEditor,
} from '@/app/lib/campaigns/platform-defaults'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const defaults = await loadPlatformCampaignDefault(admin)
    const synced_campaigns = await countLinkedPlatformDefaultCampaigns(admin)

    return NextResponse.json({
      data: defaults,
      synced_campaigns,
      configured: Boolean(defaults?.workflow_definition?.nodes?.length),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load default workflow'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/** Import a campaign as the platform default template (copies shared media + syncs linked user campaigns). */
export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const campaignId = typeof body.campaign_id === 'string' ? body.campaign_id.trim() : ''
    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const result = await savePlatformCampaignDefaultFromCampaign(admin, campaignId)

    return NextResponse.json({
      data: result.defaults,
      synced_campaigns: result.synced_campaigns,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save default workflow'
    const status = msg.includes('not found') || msg.includes('no workflow') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}

/** Save workflow edits from the admin workflow editor (syncs linked user campaigns). */
export async function PATCH(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const workflow_definition = body.workflow_definition as WorkflowDefinition | undefined
    if (!workflow_definition?.nodes?.length) {
      return NextResponse.json({ error: 'workflow_definition is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const result = await savePlatformCampaignDefaultFromEditor(admin, {
      name: typeof body.name === 'string' ? body.name : undefined,
      workflow_definition,
      workflow_layout:
        body.workflow_layout && typeof body.workflow_layout === 'object'
          ? (body.workflow_layout as Record<string, unknown>)
          : null,
    })

    return NextResponse.json({
      data: result.defaults,
      synced_campaigns: result.synced_campaigns,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to save default workflow'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
