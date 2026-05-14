import { NextResponse } from 'next/server'
import { processDueCampaignMessages } from '@/app/lib/campaigns/process-due'

export const dynamic = 'force-dynamic'

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

  console.log('cronDebugEnabled', "masuk 1=---->")

  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const url = new URL(request.url)
    const campaignIdOnly = url.searchParams.get('campaign_id')?.trim() || undefined
    const debug = cronDebugEnabled(request)

  console.log('cronDebugEnabled', "masuk 2=---->")


    const { summary, debug: debugLines } = await processDueCampaignMessages({
      debug,
      campaignIdOnly,
    })

    return NextResponse.json({
      ok: true,
      summary,
      ...(debugLines && debugLines.length > 0 ? { debug: debugLines } : {}),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Processor failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
