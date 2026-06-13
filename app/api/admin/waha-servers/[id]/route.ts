import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { handleServerProviderTypeChange } from '@/app/lib/whatsapp/provider-switch'
import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

type RouteParams = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  let body: {
    name?: string
    api_base_url?: string
    api_key?: string | null
    dashboard_pass?: string | null
    provider_type?: WhatsAppProvider
    is_default?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}

  if (typeof body.name === 'string') {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 })
    updates.name = name
  }
  if (typeof body.api_base_url === 'string') {
    const api_base_url = normalizeBaseUrl(body.api_base_url)
    if (!api_base_url) return NextResponse.json({ error: 'api_base_url cannot be empty' }, { status: 400 })
    updates.api_base_url = api_base_url
  }
  if (typeof body.api_key === 'string') {
    const key = body.api_key.trim()
    if (key) updates.api_key = key
  }
  if ('dashboard_pass' in body) {
    if (body.dashboard_pass === null) {
      updates.dashboard_pass = null
    } else if (typeof body.dashboard_pass === 'string') {
      const pass = body.dashboard_pass.trim()
      updates.dashboard_pass = pass || null
    }
  }
  if (typeof body.is_default === 'boolean') {
    updates.is_default = body.is_default
  }
  if (body.provider_type === 'wasender' || body.provider_type === 'waha') {
    updates.provider_type = body.provider_type
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()

    const { data: existing } = await admin
      .from('waha_servers')
      .select('provider_type')
      .eq('id', id)
      .maybeSingle()

    if (updates.is_default === true) {
      await admin.from('waha_servers').update({ is_default: false }).eq('is_default', true)
    }

    const { data, error } = await admin
      .from('waha_servers')
      .update(updates)
      .eq('id', id)
      .select('id, name, api_base_url, api_key, dashboard_pass, provider_type, is_default, created_at, updated_at')
      .maybeSingle()

    if (error) {
      console.error('admin waha-servers PATCH:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    if (!data) {
      return NextResponse.json({ error: 'Server not found' }, { status: 404 })
    }

    if (
      updates.provider_type &&
      existing?.provider_type &&
      existing.provider_type !== updates.provider_type
    ) {
      await handleServerProviderTypeChange(
        id,
        existing.provider_type === 'wasender' ? 'wasender' : 'waha',
        updates.provider_type as WhatsAppProvider
      )
    }

    return NextResponse.json({
      server: {
        id: data.id,
        name: data.name,
        api_base_url: data.api_base_url,
        api_key: data.api_key,
        provider_type: data.provider_type,
        is_default: data.is_default,
        created_at: data.created_at,
        updated_at: data.updated_at,
      },
      sessions_cleared:
        updates.provider_type && existing?.provider_type !== updates.provider_type
          ? true
          : undefined,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
}

export async function DELETE(_request: Request, props: RouteParams) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  const { id } = await props.params
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const { error } = await admin.from('waha_servers').delete().eq('id', id)
    if (error) {
      console.error('admin waha-servers DELETE:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
}
