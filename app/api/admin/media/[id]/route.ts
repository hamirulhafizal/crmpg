import { NextResponse } from 'next/server'

import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { loadMediaR2Settings } from '@/app/lib/media-r2-settings'
import {
  buildR2KeyWithFilenamePart,
  deleteFromR2,
  moveR2Object,
  normalizeFolder,
  sanitizeFilename,
} from '@/app/lib/media-r2-storage'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>

  try {
    const admin = createServiceRoleClient()
    const { data: existing, error: fetchError } = await admin
      .from('admin_media_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const nextTitle =
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 200)
        : existing.title
    const nextFolder =
      typeof body.folder === 'string' ? normalizeFolder(body.folder) : existing.folder

    let nextKey = existing.r2_key as string
    let nextPublicUrl = existing.public_url as string

    const folderChanged = nextFolder !== existing.folder
    if (folderChanged) {
      const settings = await loadMediaR2Settings()
      const filenamePart =
        String(existing.r2_key).split('/').pop() ||
        sanitizeFilename(String(existing.original_filename))
      nextKey = buildR2KeyWithFilenamePart(existing.media_type, filenamePart, nextFolder)
      const moved = await moveR2Object({
        settings,
        fromKey: existing.r2_key,
        toKey: nextKey,
      })
      nextPublicUrl = moved.publicUrl
    }

    const { data, error } = await admin
      .from('admin_media_assets')
      .update({
        title: nextTitle,
        folder: nextFolder,
        r2_key: nextKey,
        public_url: nextPublicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error

    return NextResponse.json({
      asset: {
        id: data.id,
        title: data.title,
        originalFilename: data.original_filename,
        mediaType: data.media_type,
        mimeType: data.mime_type,
        sizeBytes: data.size_bytes,
        r2Key: data.r2_key,
        publicUrl: data.public_url,
        folder: data.folder,
        uploadedBy: data.uploaded_by,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      },
    })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireAdminApi(request)
  if (!auth.ok) return auth.response

  const { id } = await context.params

  try {
    const admin = createServiceRoleClient()
    const { data: existing, error: fetchError } = await admin
      .from('admin_media_assets')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw fetchError
    if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 })

    const settings = await loadMediaR2Settings()
    await deleteFromR2(settings, existing.r2_key)

    const { error } = await admin.from('admin_media_assets').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Delete failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
