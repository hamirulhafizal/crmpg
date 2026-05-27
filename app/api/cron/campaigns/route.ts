import { NextResponse } from 'next/server'
import { processDueCampaignMessages } from '@/app/lib/campaigns/process-due'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorizeCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = request.headers.get('authorization')
  if (auth === `Bearer ${secret}`) return true
  const q = new URL(request.url).searchParams.get('secret')
  return q === secret
}

function cronDebugEnabled(request: Request): boolean {
  const url = new URL(request.url)
  if (url.searchParams.get('debug') === '1') return true
  const env = process.env.CAMPAIGN_CRON_DEBUG
  return env === '1' || env === 'true' || env === 'TRUE'
}

export async function GET(request: Request) {
  const startedAt = Date.now()
  const url = new URL(request.url)
  const campaignIdOnly = url.searchParams.get('campaign_id')?.trim() || undefined
  const debug = cronDebugEnabled(request)

  console.log('[campaign-cron] ── request ──', {
    at: new Date().toISOString(),
    campaign_id: campaignIdOnly ?? '(all active)',
    debug,
    vercel_region: process.env.VERCEL_REGION ?? null,
  })

  if (!authorizeCron(request)) {
    console.warn('[campaign-cron] unauthorized', {
      has_cron_secret: Boolean(process.env.CRON_SECRET),
      has_auth_header: Boolean(request.headers.get('authorization')),
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.CRON_SECRET) {
    console.error('[campaign-cron] CRON_SECRET is not set in environment')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[campaign-cron] SUPABASE_SERVICE_ROLE_KEY is not set in environment')
  }

  try {
    const { summary, debug: debugLines } = await processDueCampaignMessages({
      debug,
      campaignIdOnly,
    })

    const durationMs = Date.now() - startedAt

    console.log('[campaign-cron] ── complete ──', {
      duration_ms: durationMs,
      ...summary,
    })

    if (summary.messages_failed > 0) {
      console.warn('[campaign-cron] some sends failed', {
        attempted: summary.messages_attempted,
        sent: summary.messages_sent,
        failed: summary.messages_failed,
      })
    }

    if (summary.campaigns_skipped_schedule > 0) {
      console.log('[campaign-cron] schedule gate skipped campaigns', {
        skipped: summary.campaigns_skipped_schedule,
        processed: summary.campaigns_processed,
        scanned: summary.campaigns_scanned,
      })
    }

    return NextResponse.json({
      ok: true,
      duration_ms: durationMs,
      summary,
      ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}),
    })
  } catch (e: unknown) {
    const durationMs = Date.now() - startedAt
    const msg = e instanceof Error ? e.message : 'Processor failed'
    console.error('[campaign-cron] ── failed ──', {
      duration_ms: durationMs,
      error: msg,
      stack: e instanceof Error ? e.stack : undefined,
    })
    return NextResponse.json({ error: msg, duration_ms: durationMs }, { status: 500 })
  }
}
