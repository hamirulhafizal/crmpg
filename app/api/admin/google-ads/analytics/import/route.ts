import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { importGapMboxLeads } from '@/app/lib/google-ads/import-gap-mbox-leads'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

export const runtime = 'nodejs'

const MAX_MBOX_BYTES = 25 * 1024 * 1024

export async function POST(request: Request) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  try {
    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing mbox file (field: file)' }, { status: 400 })
    }

    if (!file.name.toLowerCase().endsWith('.mbox') && file.type !== 'application/mbox') {
      return NextResponse.json({ error: 'Upload a .mbox file from Gmail Takeout' }, { status: 400 })
    }

    if (file.size > MAX_MBOX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${Math.round(MAX_MBOX_BYTES / 1024 / 1024)} MB)` },
        { status: 400 }
      )
    }

    const mboxContent = await file.text()
    if (!mboxContent.trim()) {
      return NextResponse.json({ error: 'Mbox file is empty' }, { status: 400 })
    }

    const admin = createServiceRoleClient()
    const summary = await importGapMboxLeads(admin, mboxContent)

    return NextResponse.json({
      ok: true,
      filename: file.name,
      ...summary,
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Import failed'
    console.error('google-ads mbox import:', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
