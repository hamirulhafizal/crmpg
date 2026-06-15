import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { normalizeSendTimeForDb } from '@/app/lib/campaigns/schedule'
import { applyWorkflowToCampaignPayload } from '@/app/lib/workflows/api-payload'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { canActivateCampaign } from '@/app/lib/saas/enforce'
import { ensureUserDefaultCampaign } from '@/app/lib/campaigns/platform-defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      await ensureUserDefaultCampaign(createServiceRoleClient(), user.id)
    } catch (e) {
      console.error('[campaigns] ensureUserDefaultCampaign failed', e)
    }

    const { data: campaigns, error } = await supabase
      .from('campaigns')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) throw error

    const ids = (campaigns ?? []).map((c) => c.id)
    if (ids.length === 0) {
      return NextResponse.json({ data: [] })
    }

    const [enrRes, logRes] = await Promise.all([
      supabase.from('campaign_enrollments').select('campaign_id').in('campaign_id', ids),
      supabase.from('campaign_message_logs').select('campaign_id, send_status').in('campaign_id', ids),
    ])

    const enrolledBy = new Map<string, number>()
    for (const r of enrRes.data ?? []) {
      const k = r.campaign_id as string
      enrolledBy.set(k, (enrolledBy.get(k) ?? 0) + 1)
    }

    const sentBy = new Map<string, number>()
    for (const r of logRes.data ?? []) {
      if (r.send_status !== 'sent') continue
      const k = r.campaign_id as string
      sentBy.set(k, (sentBy.get(k) ?? 0) + 1)
    }

    const enriched = (campaigns ?? []).map((c) => ({
      ...c,
      enrolled_count: enrolledBy.get(c.id) ?? 0,
      sent_count: sentBy.get(c.id) ?? 0,
    }))

    return NextResponse.json({ data: enriched })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load campaigns'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

type StepInput = {
  step_order: number
  delay_days?: number
  send_time?: string
  message_template: string
  is_active?: boolean
}

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

    const body = await request.json().catch(() => ({}))
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      user_id: user.id,
      name,
      description: typeof body.description === 'string' ? body.description : null,
      status: (body.status as string) || 'draft',
      trigger_type: (body.trigger_type as string) || 'manual',
      trigger_offset_days: Number(body.trigger_offset_days ?? 0),
      timezone: typeof body.timezone === 'string' ? body.timezone : 'Asia/Kuala_Lumpur',
      audience_filters: (body.audience_filters ?? {}) as CampaignAudienceFilters,
      daily_send_limit: Math.max(1, Number(body.daily_send_limit ?? 100)),
      cooldown_days: Math.max(0, Number(body.cooldown_days ?? 30)),
      start_at: body.start_at ?? null,
      end_at: body.end_at ?? null,
    }

    const workflowErr = applyWorkflowToCampaignPayload(body as Record<string, unknown>, payload, {
      timezone: typeof body.timezone === 'string' ? body.timezone : 'Asia/Kuala_Lumpur',
      preserveStartAt: 'start_at' in body,
    })
    if (workflowErr) {
      return NextResponse.json({ error: workflowErr }, { status: 400 })
    }

    const steps = Array.isArray(body.steps) ? (body.steps as StepInput[]) : []
    if (steps.length === 0 && !payload.workflow_definition) {
      return NextResponse.json({ error: 'At least one step is required' }, { status: 400 })
    }

    if (payload.status === 'active') {
      const gate = await canActivateCampaign(user.id)
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error, code: gate.code }, { status: 403 })
      }
    }

    const { data: campaign, error: cErr } = await supabase.from('campaigns').insert(payload as never).select('*').single()
    if (cErr) throw cErr

    const compiledSteps =
      steps.length > 0
        ? steps
        : payload.workflow_definition
          ? compileWorkflowDefinition(payload.workflow_definition as WorkflowDefinition).steps.map((s) => ({
              step_order: s.step_order,
              delay_days: s.delay_days,
              send_time: s.send_time,
              message_template: s.message_template,
              is_active: s.is_active,
            }))
          : []

    const stepRows = compiledSteps.map((s, i) => ({
      campaign_id: campaign.id,
      step_order: Number.isFinite(s.step_order) ? s.step_order : i + 1,
      delay_days: Math.max(0, Number(s.delay_days ?? 0)),
      send_time: normalizeSendTimeForDb(s.send_time as string | undefined),
      message_template: String(s.message_template || ''),
      is_active: s.is_active !== false,
    }))

    const { error: sErr } = await supabase.from('campaign_steps').insert(stepRows)
    if (sErr) {
      await supabase.from('campaigns').delete().eq('id', campaign.id)
      throw sErr
    }

    return NextResponse.json({ data: campaign })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to create workflow'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
