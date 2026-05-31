import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { isGapFormLead } from '@/app/lib/google-ads/gap-leads'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params

  try {
    const admin = createServiceRoleClient()
    const { data: row, error: fetchErr } = await admin
      .from('customers')
      .select('id, original_data, segment_attributes')
      .eq('id', id)
      .maybeSingle()

    if (fetchErr) throw fetchErr
    if (!row) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    if (!isGapFormLead(row.original_data, row.segment_attributes)) {
      return NextResponse.json({ error: 'Only GAP registration leads can be deleted here' }, { status: 400 })
    }

    const { error: deleteErr } = await admin.from('customers').delete().eq('id', id)
    if (deleteErr) throw deleteErr

    return NextResponse.json({ ok: true, id })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to delete lead'
    console.error('google-ads lead delete:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
