import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { startProTrialForUser } from '@/app/lib/saas/start-trial'

export async function POST(request: Request) {
  const auth = await requireUserApi(request)
  if (!auth.ok) return auth.response
  const { user } = auth

  const result = await startProTrialForUser(user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
