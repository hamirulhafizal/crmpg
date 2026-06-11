import { NextResponse } from 'next/server'
import { getLeadRotationSnapshot } from '@/app/lib/google-ads/lead-rotation'
import { createClient } from '@/app/lib/supabase/server'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

/** Participant: live GAP lead rotation — who is next and your queue position. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const [{ data: participant, error: pError }, { data: profile, error: profError }] =
      await Promise.all([
        supabase
          .from('google_ads_participants')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.from('profiles').select('username_pbo').eq('id', user.id).maybeSingle(),
      ])

    if (pError) return NextResponse.json({ error: pError.message }, { status: 500 })
    if (profError) console.warn('[google-ads/rotation-status] profile load:', profError.message)
    if (!participant) {
      return NextResponse.json({ error: 'Not enrolled' }, { status: 403 })
    }

    const admin = createServiceRoleClient()
    const snapshot = await getLeadRotationSnapshot(admin, user.id)

    return NextResponse.json({
      ok: true,
      updatedAt: new Date().toISOString(),
      username_pbo: profile?.username_pbo ?? null,
      ...snapshot,
    })
  } catch (e) {
    console.error('[google-ads/rotation-status]', e)
    return NextResponse.json({ error: 'Failed to load rotation status' }, { status: 500 })
  }
}
