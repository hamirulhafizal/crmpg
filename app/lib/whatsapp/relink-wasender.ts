import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  mapWasenderStatusToDisplay,
  wasenderGetSession,
  wasenderListAllSessions,
  type WasenderSessionData,
} from '@/app/lib/wasender'
import { getWhatsAppServerConfig, loadUserWhatsAppSessions } from '@/app/lib/whatsapp/resolve'

function normalizeSessionPhone(name: string): string {
  let sessionName = name.replace(/\D/g, '')
  if (sessionName.startsWith('0')) sessionName = `60${sessionName.slice(1)}`
  else if (!sessionName.startsWith('60')) sessionName = `60${sessionName}`
  return sessionName
}

function sessionMatchesPhone(session: WasenderSessionData, phone: string): boolean {
  const target = normalizeSessionPhone(phone)
  if (!target) return false

  const fromPhone = session.phone_number ? normalizeSessionPhone(session.phone_number) : ''
  if (fromPhone === target) return true

  const fromName = normalizeSessionPhone(session.name || '')
  return fromName === target || fromName.endsWith(target) || target.endsWith(fromName)
}

async function resolveSessionApiKey(
  cfg: Awaited<ReturnType<typeof getWhatsAppServerConfig>>,
  session: WasenderSessionData
): Promise<{ externalId: string; apiKey: string; status: string } | null> {
  const externalId = String(session.id)
  let apiKey = (session.api_key || '').trim()
  let status = session.status || 'disconnected'

  if (!apiKey) {
    try {
      const full = await wasenderGetSession(cfg, externalId)
      apiKey = (full.api_key || '').trim()
      status = full.status || status
    } catch {
      return null
    }
  }

  if (!apiKey) return null
  return { externalId, apiKey, status }
}

/**
 * Re-import Wasender sessions that still exist on the provider but were removed from
 * `waha_user_sessions` (e.g. after Pro renewal cleared DB rows without deleting Wasender).
 */
export async function relinkWasenderSessionsForUser(userId: string): Promise<number> {
  const cfg = await getWhatsAppServerConfig({ userId })
  if (cfg.provider !== 'wasender') return 0

  const existing = await loadUserWhatsAppSessions(userId)
  const hasLinkedWasender = existing.some(
    (row) => row.provider_type === 'wasender' && Boolean(String(row.session_api_key || '').trim())
  )
  if (hasLinkedWasender) return 0

  const admin = createServiceRoleClient()
  const { data: profile } = await admin.from('profiles').select('phone').eq('id', userId).maybeSingle()
  const userPhone = normalizeSessionPhone(String(profile?.phone || ''))
  if (!userPhone) return 0

  let platformSessions: WasenderSessionData[] = []
  try {
    platformSessions = await wasenderListAllSessions(cfg)
  } catch {
    return 0
  }

  const matches = platformSessions.filter((session) => sessionMatchesPhone(session, userPhone))
  if (matches.length === 0) return 0

  let relinked = 0
  for (const session of matches) {
    const resolved = await resolveSessionApiKey(cfg, session)
    if (!resolved) continue

    const sessionName = userPhone
    const displayStatus = mapWasenderStatusToDisplay(resolved.status)

    const { error } = await admin.from('waha_user_sessions').upsert(
      {
        user_id: userId,
        session_name: sessionName,
        provider_type: 'wasender',
        external_session_id: resolved.externalId,
        session_api_key: resolved.apiKey,
        last_known_waha_status: displayStatus,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_name' }
    )

    if (!error) relinked += 1
  }

  return relinked
}
