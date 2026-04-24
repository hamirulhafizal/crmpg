import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

async function fetchLiveSessions(apiBaseUrl: string, apiKey: string): Promise<Map<string, string> | null> {
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

export async function POST() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const [{ data: servers, error: serversError }, { data: profiles, error: profilesError }, { data: mappings, error: mappingsError }] =
      await Promise.all([
        admin.from('waha_servers').select('id, name, api_base_url, api_key, is_default'),
        admin.from('profiles').select('id, waha_server_id'),
        admin.from('waha_user_sessions').select('id, user_id, session_name, last_known_waha_status'),
      ])

    if (serversError) return NextResponse.json({ error: serversError.message }, { status: 500 })
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
    if (mappingsError) return NextResponse.json({ error: mappingsError.message }, { status: 500 })

    const serverRows = servers || []
    const profileRows = profiles || []
    const mappingRows = mappings || []

    const defaultServerId = (serverRows.find((s) => s.is_default)?.id || '').toString()
    const profileServerByUser = new Map(profileRows.map((p) => [p.id, (p.waha_server_id || '').toString()]))
    const liveByServerId = new Map<string, Map<string, string> | null>()

    await Promise.all(
      serverRows.map(async (s) => {
        const live = await fetchLiveSessions(s.api_base_url, s.api_key)
        liveByServerId.set(s.id, live)
      })
    )

    let updated = 0
    let unchanged = 0
    let noServerResolved = 0
    let unreachableServer = 0

    for (const row of mappingRows) {
      const resolvedServerId = profileServerByUser.get(row.user_id) || defaultServerId
      if (!resolvedServerId) {
        noServerResolved++
        continue
      }

      const liveForServer = liveByServerId.get(resolvedServerId)
      if (!liveForServer) {
        unreachableServer++
        continue
      }

      const nextStatus = (liveForServer.get(row.session_name) || 'STOPPED').trim()
      const prevStatus = (row.last_known_waha_status || '').trim()
      if (nextStatus === prevStatus) {
        unchanged++
        continue
      }

      const { error: updateError } = await admin
        .from('waha_user_sessions')
        .update({ last_known_waha_status: nextStatus, updated_at: new Date().toISOString() })
        .eq('id', row.id)

      if (!updateError) updated++
    }

    return NextResponse.json({
      success: true,
      summary: {
        totalMappings: mappingRows.length,
        updated,
        unchanged,
        noServerResolved,
        unreachableServer,
      },
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to sync WAHA sessions' }, { status: 500 })
  }
}
