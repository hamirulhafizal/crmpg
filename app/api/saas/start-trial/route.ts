import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { startProTrialForUser } from '@/app/lib/saas/start-trial'

export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await startProTrialForUser(user.id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }
  return NextResponse.json({ success: true })
}
