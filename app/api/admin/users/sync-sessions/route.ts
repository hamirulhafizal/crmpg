import { NextResponse } from 'next/server'
import { requireAdminApi } from '@/app/lib/auth/require-admin'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  adminServerRowToConfig,
  fetchLiveSessionLookupForServer,
  isWasenderServer,
  resolveAdminSessionStatus,
} from '@/app/lib/whatsapp/admin-live-sessions'
import { mapWasenderStatusToDisplay, wasenderGetSessionStatus } from '@/app/lib/wasender'

export async function POST() {
  const auth = await requireAdminApi()
  if (!auth.ok) return auth.response

  try {
    const admin = createServiceRoleClient()
    const [{ data: servers, error: serversError }, { data: profiles, error: profilesError }, { data: mappings, error: mappingsError }] =
      await Promise.all([
        admin.from('waha_servers').select('id, name, api_base_url, api_key, is_default, provider_type'),
        admin.from('profiles').select('id, waha_server_id'),
        admin
          .from('waha_user_sessions')
          .select('id, user_id, session_name, session_api_key, provider_type, external_session_id, last_known_waha_status'),
      ])

    if (serversError) return NextResponse.json({ error: serversError.message }, { status: 500 })
    if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })
    if (mappingsError) return NextResponse.json({ error: mappingsError.message }, { status: 500 })

    const serverRows = servers || []
    const profileRows = profiles || []
    const mappingRows = mappings || []

    const defaultServerId = (serverRows.find((s) => s.is_default)?.id || '').toString()
    const profileServerByUser = new Map(profileRows.map((p) => [p.id, (p.waha_server_id || '').toString()]))
    const liveByServerId = new Map<string, Awaited<ReturnType<typeof fetchLiveSessionLookupForServer>>>()
    const serverById = new Map(serverRows.map((s) => [s.id, s]))

    await Promise.all(
      serverRows.map(async (s) => {
        const live = await fetchLiveSessionLookupForServer(s)
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

      const server = serverById.get(resolvedServerId)
      const liveForServer = liveByServerId.get(resolvedServerId)
      const useWasender = isWasenderServer(server) || row.provider_type === 'wasender'

      let nextStatus = resolveAdminSessionStatus(liveForServer, row, {
        storedStatus: row.last_known_waha_status,
      })

      // Only trust per-session API keys when the provider list could not be fetched.
      if (liveForServer == null && useWasender && server) {
        const sessionApiKey = (row.session_api_key || '').trim()
        if (sessionApiKey) {
          try {
            const raw = await wasenderGetSessionStatus(adminServerRowToConfig(server), sessionApiKey)
            nextStatus = mapWasenderStatusToDisplay(raw)
          } catch {
            if (!(row.session_api_key || '').trim()) {
              unreachableServer++
              continue
            }
            nextStatus = 'STOPPED'
          }
        } else {
          unreachableServer++
          continue
        }
      } else if (!useWasender && liveForServer == null) {
        unreachableServer++
        continue
      }

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
    return NextResponse.json({ error: 'Failed to sync WhatsApp sessions' }, { status: 500 })
  }
}
