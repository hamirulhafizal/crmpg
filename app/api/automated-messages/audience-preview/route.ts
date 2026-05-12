import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { buildAutomationAudiencePreview } from '@/app/lib/automation-audience-preview'

/** GET ?date=YYYY-MM-DD — preview recipients for automation kinds on that Malaysia calendar day */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const date = searchParams.get('date') || ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Invalid date; use YYYY-MM-DD' }, { status: 400 })
    }

    const preview = await buildAutomationAudiencePreview(supabase, user.id, date)
    return NextResponse.json(preview)
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
