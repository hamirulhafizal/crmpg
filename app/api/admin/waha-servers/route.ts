import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import type { WhatsAppProvider } from '@/app/lib/whatsapp/types'

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

type ServerStatus = 'online' | 'offline'

async function checkServerStatus(
  baseUrl: string,
  apiKey: string,
  provider: WhatsAppProvider
): Promise<ServerStatus> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 4000)
  try {
    const root = normalizeBaseUrl(baseUrl)
    const headers: Record<string, string> =
      provider === 'wasender'
        ? { Authorization: `Bearer ${apiKey}` }
        : { 'X-Api-Key': apiKey }
    const candidates =
      provider === 'wasender'
        ? [`${root}/api/whatsapp-sessions`, `${root}/api/status`]
        : [`${root}/api/sessions?all=true`, `${root}/api/sessions`, `${root}/api/health`, `${root}/`]

    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers,
          signal: controller.signal,
          cache: 'no-store',
        })
        if (res.status >= 200 && res.status < 500) return 'online'
      } catch {
        // try next
      }
    }
    return 'offline'
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
      .select('id, name, api_base_url, api_key, dashboard_pass, provider_type, is_default, created_at, updated_at')
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
        dashboard_pass: row.dashboard_pass ?? null,
        provider_type: row.provider_type === 'wasender' ? 'wasender' : 'waha',
        status: await checkServerStatus(row.api_base_url, row.api_key, row.provider_type === 'wasender' ? 'wasender' : 'waha'),
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
    dashboard_pass?: string | null
    provider_type?: WhatsAppProvider
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
  const dashboard_pass =
    body.dashboard_pass === null
      ? null
      : typeof body.dashboard_pass === 'string'
        ? body.dashboard_pass.trim() || null
        : null
  const is_default = Boolean(body.is_default)
  const provider_type: WhatsAppProvider = body.provider_type === 'wasender' ? 'wasender' : 'waha'
  const resolvedBaseUrl =
    provider_type === 'wasender' && !api_base_url ? 'https://wasenderapi.com' : api_base_url

  if (!name || !resolvedBaseUrl || !api_key) {
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
        api_base_url: resolvedBaseUrl,
        api_key,
        dashboard_pass: provider_type === 'wasender' ? null : dashboard_pass,
        provider_type,
        is_default,
      })
      .select('id, name, api_base_url, api_key, dashboard_pass, provider_type, is_default, created_at, updated_at')
      .single()

    if (error) {
      console.error('admin waha-servers POST:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ server: data })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
  }
}
