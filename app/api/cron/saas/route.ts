import { NextResponse } from 'next/server'
import { processSaasSubscriptionsCron } from '@/app/lib/saas/process-expiry'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

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

  const startedAt = Date.now()
  try {
    const summary = await processSaasSubscriptionsCron()
    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      summary,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'SaaS cron failed'
    console.error('[saas-cron]', msg)
    return NextResponse.json({ error: msg, duration_ms: Date.now() - startedAt }, { status: 500 })
  }
}
