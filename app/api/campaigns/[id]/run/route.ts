import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { processDueCampaignMessagesForCampaign } from '@/app/lib/campaigns/process-due'
import type { CampaignWorkflowProgressEvent } from '@/app/lib/campaigns/workflow-events'

type Ctx = { params: Promise<{ id: string }> }

function runErrorStatus(msg: string): number {
  if (msg === 'Campaign not found or not active' || msg.includes('outside its start/end window')) {
    return 400
  }
  return 500
}

/**
 * Manual trigger: same logic as GET /api/cron/campaigns but scoped to one campaign (enrollment sync + due sends, up to batch limit).
 * Add `?stream=1` for NDJSON progress events (workflow visualizer).
 */
export async function POST(request: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const url = new URL(request.url)
    const debug = url.searchParams.get('debug') === '1'
    const stream = url.searchParams.get('stream') === '1'

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

    if (stream) {
      const encoder = new TextEncoder()
      const body = new ReadableStream({
        async start(controller) {
          const emit = (event: CampaignWorkflowProgressEvent) => {
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
          }
          try {
            await processDueCampaignMessagesForCampaign(id, { debug, onProgress: emit })
            controller.close()
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Run failed'
            emit({ type: 'error', message: msg })
            controller.close()
          }
        },
      })
      return new Response(body, {
        headers: {
          'Content-Type': 'application/x-ndjson',
          'Cache-Control': 'no-store',
        },
      })
    }

    const { summary, debug: debugLines } = await processDueCampaignMessagesForCampaign(id, { debug: true })

    return NextResponse.json({
      ok: true,
      summary,
      ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Run failed'
    return NextResponse.json({ error: msg }, { status: runErrorStatus(msg) })
  }
}
