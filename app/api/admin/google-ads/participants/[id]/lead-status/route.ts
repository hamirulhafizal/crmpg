import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { setParticipantLeadEmail } from '@/app/lib/google-ads/rotation-queue-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteParams = { params: Promise<{ id: string }> }

type PatchBody = {
  lead_email?: boolean
}

/** Admin: undo or set lead rotation status for a participant (e.g. duplicate customer fix). */
export async function PATCH(request: Request, props: RouteParams) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  let body: PatchBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (typeof body.lead_email !== 'boolean') {
    return NextResponse.json({ error: 'lead_email (boolean) is required' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    await setParticipantLeadEmail(admin, id, body.lead_email)
    return NextResponse.json({ ok: true, participant_id: id, lead_email: body.lead_email })
  } catch (e) {
    console.error('[admin/google-ads/participants/lead-status]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update lead status' },
      { status: 400 }
    )
  }
}
