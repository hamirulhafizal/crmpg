import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import { normalizeSendTimeForDb } from '@/app/lib/campaigns/schedule'
import { applyWorkflowToCampaignPayload } from '@/app/lib/workflows/api-payload'
import { compileWorkflowDefinition } from '@/app/lib/workflows/compile'
import type { WorkflowDefinition } from '@/app/lib/workflows/types'
import { canActivateCampaign } from '@/app/lib/saas/enforce'
import { ensureUserDefaultCampaign, loadCampaignPlatformDefaultTier } from '@/app/lib/campaigns/platform-defaults'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type ServiceClient = ReturnType<typeof createServiceRoleClient>

/** Exact per-campaign totals. Fetching rows hits PostgREST's 1000-row cap and the list count drops to 0 after refresh. */
async function countByCampaignId(
  admin: ServiceClient,
  table: 'campaign_enrollments' | 'campaign_message_logs',
  ids: string[],
  extra?: { sendStatus?: string; sentAtGte?: string }
): Promise<Map<string, number>> {
  const rows = await Promise.all(
    ids.map(async (id) => {
      let q = admin.from(table).select('id', { count: 'exact', head: true }).eq('campaign_id', id)
      if (extra?.sendStatus) q = q.eq('send_status', extra.sendStatus)
      if (extra?.sentAtGte) q = q.gte('sent_at', extra.sentAtGte)
      const { count, error } = await q
      if (error) {
        console.error(`[campaigns] count ${table} failed`, id, error.message)
        return [id, 0] as const
      }
      return [id, count ?? 0] as const
    })
  )
  return new Map(rows)
}

export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth
    const admin = createServiceRoleClient()

    try {
      await ensureUserDefaultCampaign(admin, user.id)
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

    const dayStartIso = new Date(
      Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
    ).toISOString()

    const [enrolledBy, sentBy, sentTodayBy] = await Promise.all([
      countByCampaignId(admin, 'campaign_enrollments', ids),
      countByCampaignId(admin, 'campaign_message_logs', ids, { sendStatus: 'sent' }),
      countByCampaignId(admin, 'campaign_message_logs', ids, {
        sendStatus: 'sent',
        sentAtGte: dayStartIso,
      }),
    ])

    const enriched = await Promise.all(
      (campaigns ?? []).map(async (c) => {
        const tier = await loadCampaignPlatformDefaultTier(admin, c.platform_default_id)
        return {
          ...c,
          platform_default_tier: tier,
          enrolled_count: enrolledBy.get(c.id) ?? 0,
          sent_count: sentBy.get(c.id) ?? 0,
          sent_today_count: sentTodayBy.get(c.id) ?? 0,
        }
      })
    )

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
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth

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
