import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

function normalizeSendTime(t: string | undefined): string {
  const s = (t || '10:00').trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  return '10:00:00'
}

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
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

    const { data: src, error: cErr } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (cErr) throw cErr
    if (!src) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { data: steps } = await supabase.from('campaign_steps').select('*').eq('campaign_id', id)

    const { data: clone, error: insErr } = await supabase
      .from('campaigns')
      .insert({
        user_id: user.id,
        name: `${src.name} (copy)`,
        description: src.description,
        status: 'draft',
        trigger_type: src.trigger_type,
        trigger_offset_days: src.trigger_offset_days,
        timezone: src.timezone,
        audience_filters: src.audience_filters,
        daily_send_limit: src.daily_send_limit,
        cooldown_days: src.cooldown_days,
        start_at: src.start_at,
        end_at: src.end_at,
      })
      .select('*')
      .single()

    if (insErr) throw insErr

    const stepRows = (steps ?? []).map((s) => ({
      campaign_id: clone.id,
      step_order: s.step_order,
      delay_days: s.delay_days,
      send_time: normalizeSendTime(s.send_time),
      message_template: s.message_template,
      is_active: s.is_active,
    }))

    if (stepRows.length > 0) {
      const { error: sErr } = await supabase.from('campaign_steps').insert(stepRows)
      if (sErr) throw sErr
    }

    return NextResponse.json({ data: clone })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Duplicate failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
