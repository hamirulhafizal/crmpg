import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'
import { ensureDealerSettings, updateDealerSlug } from '@/app/lib/lucky-draw/dealer-settings'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await ensureDealerSettings(supabase, user.id)
    return NextResponse.json({ data: settings })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to load dealer settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const dealer_slug = typeof body.dealer_slug === 'string' ? body.dealer_slug : ''
    if (!dealer_slug.trim()) {
      return NextResponse.json({ error: 'dealer_slug is required' }, { status: 400 })
    }

    const settings = await updateDealerSlug(supabase, user.id, dealer_slug)
    return NextResponse.json({ data: settings })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Failed to update dealer slug'
    const status = msg.includes('already taken') || msg.includes('Invalid slug') ? 400 : 500
    return NextResponse.json({ error: msg }, { status })
  }
}
