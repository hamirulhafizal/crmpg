import { NextResponse } from 'next/server'
import { requireUserApi } from '@/app/lib/auth/require-user'
import { listNestedTierCustomerIds } from '@/app/lib/customers/frontline-tier'

const DELETE_CHUNK = 150

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  })
}

/** GET — preview how many nested (tier 2+) customers would be deleted. */
export async function GET(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth
    const { rootPgCode, keepCount, deleteIds } = await listNestedTierCustomerIds(
      supabase,
      user.id
    )
    return noStoreJson({
      root_pg_code: rootPgCode,
      keep_count: keepCount,
      nested_count: deleteIds.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to preview nested tiers'
    return noStoreJson({ error: message }, 500)
  }
}

/** DELETE — permanently remove tier 2+ customers. Direct frontline (tier 1) is kept. */
export async function DELETE(request: Request) {
  try {
    const auth = await requireUserApi(request)
    if (!auth.ok) return auth.response
    const { user, supabase } = auth
    const { rootPgCode, keepCount, deleteIds } = await listNestedTierCustomerIds(
      supabase,
      user.id
    )

    let deleted = 0
    for (let i = 0; i < deleteIds.length; i += DELETE_CHUNK) {
      const chunk = deleteIds.slice(i, i + DELETE_CHUNK)
      const { error, count } = await supabase
        .from('customers')
        .delete({ count: 'exact' })
        .in('id', chunk)
        .eq('user_id', user.id)
      if (error) {
        return noStoreJson(
          {
            error: error.message,
            deleted,
            keep_count: keepCount,
            nested_count: deleteIds.length,
          },
          500
        )
      }
      deleted += count ?? chunk.length
    }

    return noStoreJson({
      success: true,
      root_pg_code: rootPgCode,
      deleted,
      keep_count: keepCount,
      nested_count: deleteIds.length,
      message:
        deleted === 0
          ? 'No nested customers to delete. Direct frontline is unchanged.'
          : `Deleted ${deleted.toLocaleString()} nested customer(s) (tier 2+). ${keepCount.toLocaleString()} direct frontline kept.`,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete nested tiers'
    return noStoreJson({ error: message }, 500)
  }
}
