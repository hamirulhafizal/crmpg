import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

type UserCreateBody = {
  email?: string
  password?: string
  full_name?: string
  role?: 'user' | 'admin'
  locale?: string | null
  timezone?: string | null
  waha_server_id?: string | null
}

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

async function fetchLiveSessionsForServer(
  apiBaseUrl: string,
  apiKey: string
): Promise<Map<string, string> | null> {
  const base = normalizeBaseUrl(apiBaseUrl)
  if (!base || !apiKey) return null

  try {
    const res = await fetch(`${base}/api/sessions?all=true`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => [])) as Array<{ name?: string; status?: string }>
    const map = new Map<string, string>()
    for (const row of Array.isArray(data) ? data : []) {
      const name = (row?.name || '').trim()
      if (name) map.set(name, (row?.status || '').toString())
    }
    return map
  } catch {
    return null
  }
}

export async function GET() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const [{ data: profiles, error: profilesError }, authUsersResult, sessionsResult, serversResult] =
      await Promise.all([
      admin
        .from('profiles')
        .select('id, full_name, role, locale, timezone, waha_server_id, created_at, updated_at'),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      admin
        .from('waha_user_sessions')
        .select('id, user_id, session_name, last_known_waha_status, created_at')
        .order('created_at', { ascending: false }),
      admin.from('waha_servers').select('id, api_base_url, api_key, is_default'),
    ])

    if (profilesError) {
      return NextResponse.json({ error: profilesError.message }, { status: 500 })
    }
    if (sessionsResult.error) {
      return NextResponse.json({ error: sessionsResult.error.message }, { status: 500 })
    }
    if (authUsersResult.error) {
      return NextResponse.json({ error: authUsersResult.error.message }, { status: 500 })
    }
    if (serversResult.error) {
      return NextResponse.json({ error: serversResult.error.message }, { status: 500 })
    }

    const usersById = new Map((authUsersResult.data?.users || []).map((u) => [u.id, u]))
    const profileByUserId = new Map((profiles || []).map((p) => [p.id, p]))
    const allServers = serversResult.data || []
    const defaultServerId = (allServers.find((s) => s.is_default)?.id || '').toString()
    const liveByServerId = new Map<string, Map<string, string> | null>()

    for (const server of allServers) {
      const liveMap = await fetchLiveSessionsForServer(server.api_base_url, server.api_key)
      liveByServerId.set(server.id, liveMap)
    }

    const sessionsByUserId = new Map<string, Array<Record<string, unknown>>>()
    for (const row of sessionsResult.data || []) {
      const profile = profileByUserId.get(row.user_id)
      const serverId = ((profile?.waha_server_id || defaultServerId || '') as string).trim()
      const liveForServer = serverId ? liveByServerId.get(serverId) || null : null
      const liveStatus = liveForServer?.get(row.session_name) || null

      const list = sessionsByUserId.get(row.user_id) || []
      list.push({
        ...(row as unknown as Record<string, unknown>),
        // Prefer live WAHA status when available, fallback to tracked DB status.
        last_known_waha_status: liveStatus || row.last_known_waha_status || null,
      })
      sessionsByUserId.set(row.user_id, list)
    }

    const users = (profiles || []).map((p) => {
      const au = usersById.get(p.id)
      return {
        id: p.id,
        email: au?.email || null,
        full_name: p.full_name,
        role: p.role,
        locale: p.locale,
        timezone: p.timezone,
        waha_server_id: p.waha_server_id,
        sessions: sessionsByUserId.get(p.id) || [],
        created_at: p.created_at,
        updated_at: p.updated_at,
      }
    })

    return NextResponse.json({ users })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load users' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  let body: UserCreateBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const password = typeof body.password === 'string' ? body.password.trim() : ''
  const fullName = typeof body.full_name === 'string' ? body.full_name.trim() : null
  const role = body.role === 'admin' ? 'admin' : 'user'
  const locale = typeof body.locale === 'string' ? body.locale.trim() || 'en' : 'en'
  const timezone = typeof body.timezone === 'string' ? body.timezone.trim() : null
  const wahaServerId = typeof body.waha_server_id === 'string' ? body.waha_server_id.trim() : null

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 })
  }

  try {
    const admin = createServiceRoleClient()
    const createRes = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    })

    if (createRes.error || !createRes.data.user) {
      return NextResponse.json({ error: createRes.error?.message || 'Unable to create user' }, { status: 400 })
    }

    const userId = createRes.data.user.id
    const { error: profileError } = await admin.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      role,
      locale,
      timezone,
      waha_server_id: wahaServerId || null,
      updated_at: new Date().toISOString(),
    })

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    return NextResponse.json({ user: { id: userId, email, role } })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
