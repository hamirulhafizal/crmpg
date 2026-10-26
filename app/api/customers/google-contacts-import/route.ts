import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { loadGoogleContactImportRows } from '@/app/lib/customers/google-contacts-import'

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

/** GET — customers in tree tiers 1–4, with Google Contacts save names. */
export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth
    const result = await loadGoogleContactImportRows(supabase, user.id)
    return noStoreJson({
      data: result.data,
      counts: result.counts,
      total: result.counts.total,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to load Google Contacts import rows'
    return noStoreJson({ error: message }, 500)
  }
}
