import { NextResponse } from 'next/server'

import { TryPostApiError } from '@/app/lib/trypost/client'
import { requireSocialSchedulingApi } from '@/app/lib/trypost/access'
import { deleteMirroredPost } from '@/app/lib/trypost/posts'

function errorResponse(err: unknown) {
  if (err instanceof TryPostApiError) {
    return NextResponse.json(
      { error: err.message, details: err.body },
      { status: err.status >= 400 && err.status < 600 ? err.status : 500 }
    )
  }
  const message = err instanceof Error ? err.message : 'Unexpected error'
  return NextResponse.json({ error: message }, { status: 500 })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireSocialSchedulingApi(request)
  if (!auth.ok) return auth.response

  try {
    const { id } = await context.params
    await deleteMirroredPost(auth.user.id, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return errorResponse(err)
  }
}
