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

export async function GET(request: Request) {
  if (!authorizeCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const summary = await processDueCampaignMessages()
    return NextResponse.json({ ok: true, summary })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Processor failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
