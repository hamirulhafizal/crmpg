import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

type ServerStatus = 'online' | 'offline'

async function checkServerStatus(baseUrl: string, apiKey: string): Promise<ServerStatus> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const url = `${normalizeBaseUrl(baseUrl)}/api/sessions?all=true`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Api-Key': apiKey,
      },
      signal: controller.signal,
      cache: 'no-store',
    })
    return res.ok ? 'online' : 'offline'
  } catch {
    return 'offline'
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('waha_servers')
      .select('id, name, api_base_url, api_key, is_default, created_at, updated_at')
      .order('name', { ascending: true })

    if (error) {
      console.error('admin waha-servers GET:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const servers = await Promise.all(
      (data || []).map(async (row) => ({
        id: row.id,
        name: row.name,
        api_base_url: row.api_base_url,
        api_key: row.api_key,
        status: await checkServerStatus(row.api_base_url, row.api_key),
        is_default: row.is_default,
        created_at: row.created_at,
        updated_at: row.updated_at,
      }))
    )

    return NextResponse.json({ servers })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: {
    name?: string
    api_base_url?: string
    api_key?: string
    is_default?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  const api_base_url = typeof body.api_base_url === 'string' ? normalizeBaseUrl(body.api_base_url) : ''
  const api_key = typeof body.api_key === 'string' ? body.api_key.trim() : ''
  const is_default = Boolean(body.is_default)

  if (!name || !api_base_url || !api_key) {
    return NextResponse.json(
      { error: 'name, api_base_url, and api_key are required' },
      { status: 400 }
    )
  }

  try {
    const admin = createServiceRoleClient()

    if (is_default) {
      await admin.from('waha_servers').update({ is_default: false }).eq('is_default', true)
    }

    const { data, error } = await admin
      .from('waha_servers')
      .insert({
        name,
        api_base_url,
        api_key,
        is_default,
      })
      .select('id, name, api_base_url, is_default, created_at, updated_at')
      .single()

    if (error) {
      console.error('admin waha-servers POST:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      server: {
        ...data,
        api_key,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
}
