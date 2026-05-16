import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import type { CampaignAudienceFilters } from '@/app/lib/campaigns/types'
import {
  computeDueAudiencePreview,
  computeEligibleAudiencePreview,
  describeCampaignAudienceFilters,
  resolveTagIdLabels,
} from '@/app/lib/campaigns/audience-preview'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: campaign, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (cErr) throw cErr
    if (!campaign) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: steps } = await supabase
      .from('campaign_steps')
      .select('*')
      .eq('campaign_id', id)
      .order('step_order', { ascending: true })

    const [{ count: enrolled }, { count: sent }, { count: failed }, { count: completed }] = await Promise.all([
      supabase
        .from('campaign_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id),
      supabase
        .from('campaign_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('send_status', 'sent'),
      supabase
        .from('campaign_message_logs')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('send_status', 'failed'),
      supabase
        .from('campaign_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', id)
        .eq('status', 'completed'),
    ])

    const { data: recentLogs } = await supabase
      .from('campaign_message_logs')
      .select('id, send_status, sent_at, error_message, customer_id, created_at')
      .eq('campaign_id', id)
      .order('created_at', { ascending: false })
      .limit(25)

    const filters = (campaign.audience_filters || {}) as CampaignAudienceFilters
    const isoNow = new Date().toISOString()

    const tagIdList = (filters.tag_ids ?? []).map(String).filter(Boolean)
    const tagIdLabels = tagIdList.length > 0 ? await resolveTagIdLabels(supabase, tagIdList) : undefined

    const [eligible, dueNow] = await Promise.all([
      computeEligibleAudiencePreview(supabase, user.id, filters),
      computeDueAudiencePreview(supabase, id, isoNow),
    ])

    return NextResponse.json({
      data: {
        campaign,
        steps: steps ?? [],
        stats: {
          enrolled: enrolled ?? 0,
          sent: sent ?? 0,
          failed: failed ?? 0,
          completed: completed ?? 0,
        },
        recent_logs: recentLogs ?? [],
        audience: {
          criteria_lines: describeCampaignAudienceFilters(filters, tagIdLabels),
          filters,
          generated_at: isoNow,
          eligible: {
            matching_total: eligible.matching_total,
            customers_scanned: eligible.customers_scanned,
            sample: eligible.sample,
          },
          due_now: {
            total: dueNow.due_total,
            sample: dueNow.sample,
          },
        },
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load campaign'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))

    const updates: Record<string, unknown> = {}
    if (typeof body.name === 'string') updates.name = body.name.trim()
    if (typeof body.description === 'string') updates.description = body.description
    if (typeof body.status === 'string') updates.status = body.status
    if (typeof body.trigger_type === 'string') updates.trigger_type = body.trigger_type
    if (body.trigger_offset_days != null) updates.trigger_offset_days = Number(body.trigger_offset_days)
    if (typeof body.timezone === 'string') updates.timezone = body.timezone
    if (body.audience_filters != null) updates.audience_filters = body.audience_filters as CampaignAudienceFilters
    if (body.workflow_layout != null && typeof body.workflow_layout === 'object') {
      updates.workflow_layout = body.workflow_layout
    }
    if (body.daily_send_limit != null) updates.daily_send_limit = Math.max(1, Number(body.daily_send_limit))
    if (body.cooldown_days != null) updates.cooldown_days = Math.max(0, Number(body.cooldown_days))
    if ('start_at' in body) updates.start_at = body.start_at
    if ('end_at' in body) updates.end_at = body.end_at

    const { data: campaign, error: uErr } = await supabase
      .from('campaigns')
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('*')
      .maybeSingle()

    if (uErr) throw uErr
    if (!campaign) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (Array.isArray(body.steps)) {
      await supabase.from('campaign_steps').delete().eq('campaign_id', id)
      const stepRows = (body.steps as Array<Record<string, unknown>>).map((s, i) => ({
        campaign_id: id,
        step_order: Number.isFinite(s.step_order as number) ? Number(s.step_order) : i + 1,
        delay_days: Math.max(0, Number(s.delay_days ?? 0)),
        send_time:
          String(s.send_time || '10:00').length <= 5
            ? `${String(s.send_time || '10:00')}:00`
            : String(s.send_time),
        message_template: String(s.message_template || ''),
        is_active: s.is_active !== false,
      }))
      if (stepRows.length > 0) {
        const { error: sErr } = await supabase.from('campaign_steps').insert(stepRows)
        if (sErr) throw sErr
      }
    }

    return NextResponse.json({ data: campaign })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update campaign'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.from('campaigns').delete().eq('id', id).eq('user_id', user.id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to delete'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
