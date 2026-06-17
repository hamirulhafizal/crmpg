import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { canActivateCampaign } from '@/app/lib/saas/enforce'

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: drafts, error } = await supabase
      .from('campaigns')
      .select('id, status')
      .eq('user_id', user.id)
      .in('status', ['draft', 'paused'])
      .order('created_at', { ascending: true })

    if (error) throw error

    let activated = 0
    let skippedPro = 0
    let stoppedAtLimit = false
    const errors: string[] = []

    for (const row of drafts ?? []) {
      const gate = await canActivateCampaign(user.id, row.id)
      if (!gate.ok) {
        if (gate.code === 'pro_required') {
          skippedPro++
          continue
        }
        if (gate.code === 'campaign_limit') {
          stoppedAtLimit = true
          break
        }
        errors.push(gate.error)
        continue
      }

      const { error: updErr } = await supabase
        .from('campaigns')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('user_id', user.id)

      if (updErr) {
        errors.push(updErr.message)
        continue
      }
      activated++
    }

    return NextResponse.json({
      success: true,
      activated,
      skipped_pro: skippedPro,
      stopped_at_limit: stoppedAtLimit,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to activate workflows'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
