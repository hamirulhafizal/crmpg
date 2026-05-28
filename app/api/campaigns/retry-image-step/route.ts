import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { buildCampaignWorkflowPlan } from '@/app/lib/workflows/plan'
import { isImageStepNode, whatsAppNodeForStep } from '@/app/lib/campaigns/whatsapp-send-options'

/**
 * Reset enrollments so the image step can run again after a failed/abandoned send.
 * POST { campaign_id, enrollment_ids?: string[] }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as {
      campaign_id?: string
      enrollment_ids?: string[]
    }
    const campaignId = body.campaign_id?.trim()
    if (!campaignId) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const { data: campaign, error: campErr } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (campErr || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
    }

    const { data: stepRows } = await admin
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('step_order', { ascending: true })

    const plan = buildCampaignWorkflowPlan(
      campaign as Parameters<typeof buildCampaignWorkflowPlan>[0],
      stepRows ?? []
    )

    const imageStep = (stepRows ?? []).find((s) => {
      const node = whatsAppNodeForStep(plan, s.step_order)
      return isImageStepNode(node)
    })

    if (!imageStep) {
      return NextResponse.json({ error: 'No image step in this campaign' }, { status: 400 })
    }

    const imageOrder = imageStep.step_order
    const priorOrder = Math.max(0, imageOrder - 1)
    const now = new Date().toISOString()

    let query = admin
      .from('campaign_enrollments')
      .select('id, metadata, status, last_step_sent')
      .eq('campaign_id', campaignId)

    if (body.enrollment_ids?.length) {
      query = query.in('id', body.enrollment_ids)
    } else {
      query = query.in('status', ['active', 'completed'])
    }

    const { data: rows, error: listErr } = await query
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 })
    }

    const targets = (rows ?? []).filter(
      (r) =>
        Number(r.last_step_sent) >= priorOrder &&
        (r.status === 'completed' ||
          (r.metadata &&
            typeof r.metadata === 'object' &&
            (r.metadata as Record<string, unknown>).step_send_abandoned))
    )

    if (targets.length === 0) {
      return NextResponse.json({
        ok: true,
        reset: 0,
        message: 'No enrollments need an image retry',
      })
    }

    let reset = 0
    for (const row of targets) {
      const meta = { ...((row.metadata as Record<string, unknown>) ?? {}) }
      delete meta.step_send_abandoned

      const { error: uErr } = await admin
        .from('campaign_enrollments')
        .update({
          status: 'active',
          last_step_sent: priorOrder,
          next_send_at: now,
          completed_at: null,
          metadata: meta,
        })
        .eq('id', row.id)

      if (!uErr) reset++
    }

    return NextResponse.json({
      ok: true,
      reset,
      image_step_order: imageOrder,
      message:
        reset > 0
          ? `Queued ${reset} enrollment(s) to retry image step ${imageOrder}. Run cron or wait for the next schedule.`
          : 'No rows updated',
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Retry failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
