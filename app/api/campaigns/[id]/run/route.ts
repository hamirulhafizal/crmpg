import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { processDueCampaignMessagesForCampaign } from '@/app/lib/campaigns/process-due'

type Ctx = { params: Promise<{ id: string }> }

/**
 * Manual trigger: same logic as GET /api/cron/campaigns but scoped to one campaign (enrollment sync + due sends, up to batch limit).
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const url = new URL(request.url)
    const debug = url.searchParams.get('debug') === '1'

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: row, error: qErr } = await supabase
      .from('campaigns')
      .select('id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (qErr) throw qErr
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { summary, debug: debugLines } = await processDueCampaignMessagesForCampaign(id, { debug })

    console.log('cronDebugEnabled', "masuk 5=---->", summary)

    return NextResponse.json({
      ok: true,
      summary,
      ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Run failed'
    if (
      msg === 'Campaign not found or not active' ||
      msg.includes('outside its start/end window')
    ) {
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
