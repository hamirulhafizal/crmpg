import QRCode from 'qrcode'
import { canUseWasenderForUser, userHasPlatformWriteAccess } from '@/app/lib/saas/enforce'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  mapWasenderStatusToDisplay,
  wasenderConnectSession,
  wasenderCreateSession,
  wasenderDeleteSession,
  wasenderDisconnectSession,
  wasenderGetQrCode,
  wasenderGetSessionStatus,
} from '@/app/lib/wasender'
import { wahaFetch } from '@/app/lib/waha'
import {
  fetchWasenderLiveSessionLookup,
  resolveAdminSessionStatus,
} from '@/app/lib/whatsapp/admin-live-sessions'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSessions,
} from '@/app/lib/whatsapp/resolve'
import type { WhatsAppProvider, WhatsAppSessionView } from '@/app/lib/whatsapp/types'
import { WhatsAppApiError } from '@/app/lib/whatsapp/errors'
import { persistWhatsAppSessionStatus } from '@/app/lib/whatsapp/session-status'

function normalizeSessionPhone(name: string): string {
  let sessionName = name.replace(/\D/g, '')
  if (sessionName.startsWith('0')) sessionName = `60${sessionName.slice(1)}`
  else if (!sessionName.startsWith('60')) sessionName = `60${sessionName}`
  return sessionName
}

export async function listWhatsAppSessions(userId: string): Promise<WhatsAppSessionView[]> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const rows = await loadUserWhatsAppSessions(userId)
  if (rows.length === 0) return []

  if (cfg.provider === 'wasender') {
    let platformLookup = null as Awaited<ReturnType<typeof fetchWasenderLiveSessionLookup>> | null
    try {
      platformLookup = await fetchWasenderLiveSessionLookup(cfg)
    } catch {
      platformLookup = null
    }

    const out: WhatsAppSessionView[] = []
    for (const row of rows) {
      let status = row.last_known_waha_status || 'DISCONNECTED'
      if (platformLookup) {
        status = resolveAdminSessionStatus(platformLookup, row, { storedStatus: row.last_known_waha_status })
        await persistWhatsAppSessionStatus(userId, row.session_name, status)
      } else if (row.session_api_key) {
        try {
          const raw = await wasenderGetSessionStatus(cfg, row.session_api_key)
          status = mapWasenderStatusToDisplay(raw)
          await persistWhatsAppSessionStatus(userId, row.session_name, status)
        } catch {
          status = row.last_known_waha_status || 'DISCONNECTED'
        }
      }
      out.push({
        name: row.session_name,
        status,
        provider: 'wasender',
        externalSessionId: row.external_session_id,
      })
    }
    return out
  }

  const allowedNames = rows.map((r) => r.session_name)
  const allSessions = await wahaFetch<
    Array<{ name: string; status: string; me?: { id?: string; pushName?: string } | null; engine?: { engine?: string } }>
  >('/api/sessions?all=true', {}, { userId })

  return (Array.isArray(allSessions) ? allSessions : [])
    .filter((s) => allowedNames.includes(s.name))
    .map((s) => ({
      name: s.name,
      status: s.status,
      provider: 'waha' as WhatsAppProvider,
      me: s.me,
      engine: s.engine,
    }))
}

export async function createWhatsAppSession(
  userId: string,
  input: { name: string; start?: boolean; config?: unknown }
): Promise<WhatsAppSessionView> {
  if (!(await userHasPlatformWriteAccess(userId))) {
    throw new WhatsAppApiError(
      'Your free trial has ended. Upgrade to Pro to connect WhatsApp.',
      403,
      'create',
      'waha'
    )
  }

  const cfg = await getWhatsAppServerConfig({ userId })
  const sessionName = normalizeSessionPhone(input.name)
  const admin = createServiceRoleClient()

  if (cfg.provider === 'wasender') {
    if (!(await canUseWasenderForUser(userId))) {
      throw new WhatsAppApiError(
        'WasenderAPI unlocks after paid Pro. Pro trial uses WAHA — upgrade at Billing & plans.',
        403,
        'create',
        'wasender'
      )
    }
    const created = await wasenderCreateSession(cfg, {
      name: `CRM ${sessionName}`,
      phoneNumber: `+${sessionName}`,
    })
    const externalId = String(created.id)
    const sessionApiKey = (created.api_key || '').trim()
    if (!sessionApiKey) {
      throw new WhatsAppApiError('Wasender session missing api_key', 500, '/api/whatsapp-sessions', 'wasender')
    }

    let status = mapWasenderStatusToDisplay(created.status || 'disconnected')
    if (input.start !== false) {
      const connect = await wasenderConnectSession(cfg, externalId)
      status = mapWasenderStatusToDisplay(connect.status || 'need_scan')
    }

    await admin.from('waha_user_sessions').upsert(
      {
        user_id: userId,
        session_name: sessionName,
        provider_type: 'wasender',
        external_session_id: externalId,
        session_api_key: sessionApiKey,
        last_known_waha_status: status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,session_name' }
    )

    return {
      name: sessionName,
      status,
      provider: 'wasender',
      externalSessionId: externalId,
    }
  }

  const result = await wahaFetch<{
    name: string
    status: string
    me?: unknown
    engine?: { engine?: string }
  }>(
    '/api/sessions',
    {
      method: 'POST',
      body: JSON.stringify({
        name: sessionName,
        start: input.start !== false,
        config: input.config || {},
      }),
    },
    { userId }
  )

  await admin.from('waha_user_sessions').upsert(
    {
      user_id: userId,
      session_name: result.name || sessionName,
      provider_type: 'waha',
      external_session_id: null,
      session_api_key: null,
      last_known_waha_status: result.status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,session_name' }
  )

  return {
    name: result.name || sessionName,
    status: result.status,
    provider: 'waha',
    engine: result.engine,
  }
}

export async function getWhatsAppSessionQr(
  userId: string,
  sessionName: string,
  opts?: { forceReconnect?: boolean }
): Promise<{ qrcode?: string; qrString?: string; mimetype?: string; alreadyConnected?: boolean }> {
  if (!(await userHasPlatformWriteAccess(userId))) {
    throw new WhatsAppApiError(
      'Your free trial has ended. Upgrade to Pro to connect WhatsApp.',
      403,
      'qr',
      'waha'
    )
  }

  const cfg = await getWhatsAppServerConfig({ userId })
  const rows = await loadUserWhatsAppSessions(userId)
  const row = rows.find((r) => r.session_name === sessionName)
  if (!row) throw new WhatsAppApiError('Session not found', 404, 'qr', cfg.provider)

  if (cfg.provider === 'wasender') {
    const externalId = row.external_session_id
    if (!externalId) throw new WhatsAppApiError('Wasender session id missing', 400, 'qr', 'wasender')

    if (row.session_api_key) {
      try {
        const live = await wasenderGetSessionStatus(cfg, row.session_api_key)
        if (live.toLowerCase() === 'connected' && !opts?.forceReconnect) {
          return { alreadyConnected: true }
        }
      } catch {
        // continue to connect flow
      }
    }

    if (opts?.forceReconnect) {
      try {
        await wasenderDisconnectSession(cfg, externalId)
      } catch {
        // session may already be disconnected
      }
    }

    await wasenderConnectSession(cfg, externalId)
    const qrString = await wasenderGetQrCode(cfg, externalId)
    if (!qrString) {
      throw new WhatsAppApiError('No QR data from Wasender. Try refresh in a few seconds.', 404, 'qr', 'wasender')
    }
    const pngBase64 = await QRCode.toDataURL(qrString, { margin: 1, width: 280 })
    const qrcode = pngBase64.replace(/^data:image\/png;base64,/, '')
    return { qrcode, qrString, mimetype: 'image/png' }
  }

  const result = await wahaFetch<{ data?: string; value?: string }>(
    `/api/${encodeURIComponent(sessionName)}/auth/qr?format=image`,
    { headers: { Accept: 'application/json' } },
    { userId }
  )
  if (result?.data) return { qrcode: result.data, mimetype: 'image/png' }
  if (result?.value) return { qrString: result.value }
  throw new WhatsAppApiError('No QR data', 404, 'qr', 'waha')
}

export async function startWhatsAppSession(userId: string, sessionName: string): Promise<WhatsAppSessionView> {
  if (!(await userHasPlatformWriteAccess(userId))) {
    throw new WhatsAppApiError(
      'Your free trial has ended. Upgrade to Pro to connect WhatsApp.',
      403,
      'start',
      'waha'
    )
  }

  const cfg = await getWhatsAppServerConfig({ userId })
  if (cfg.provider === 'wasender') {
    const rows = await loadUserWhatsAppSessions(userId)
    const row = rows.find((r) => r.session_name === sessionName)
    if (!row?.external_session_id) throw new WhatsAppApiError('Session not found', 404, 'start', 'wasender')
    const connect = await wasenderConnectSession(cfg, row.external_session_id)
    const status = mapWasenderStatusToDisplay(connect.status || 'need_scan')
    const admin = createServiceRoleClient()
    await admin
      .from('waha_user_sessions')
      .update({ last_known_waha_status: status, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_name', sessionName)
    return { name: sessionName, status, provider: 'wasender', externalSessionId: row.external_session_id }
  }

  const result = await wahaFetch<{ name: string; status: string }>(
    `/api/sessions/${encodeURIComponent(sessionName)}/start`,
    { method: 'POST', body: '{}' },
    { userId }
  )
  return { name: result.name, status: result.status, provider: 'waha' }
}

export async function stopWhatsAppSession(userId: string, sessionName: string): Promise<WhatsAppSessionView> {
  const cfg = await getWhatsAppServerConfig({ userId })
  if (cfg.provider === 'wasender') {
    const rows = await loadUserWhatsAppSessions(userId)
    const row = rows.find((r) => r.session_name === sessionName)
    if (!row?.external_session_id) throw new WhatsAppApiError('Session not found', 404, 'stop', 'wasender')
    await wasenderDisconnectSession(cfg, row.external_session_id)
    const admin = createServiceRoleClient()
    await admin
      .from('waha_user_sessions')
      .update({ last_known_waha_status: 'STOPPED', updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('session_name', sessionName)
    return { name: sessionName, status: 'STOPPED', provider: 'wasender' }
  }

  const result = await wahaFetch<{ name: string; status: string }>(
    `/api/sessions/${encodeURIComponent(sessionName)}/stop`,
    { method: 'POST', body: '{}' },
    { userId }
  )
  return { name: result.name, status: result.status, provider: 'waha' }
}

export async function deleteWhatsAppSession(userId: string, sessionName: string): Promise<void> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const rows = await loadUserWhatsAppSessions(userId)
  const row = rows.find((r) => r.session_name === sessionName)

  if (cfg.provider === 'wasender' && row?.external_session_id) {
    try {
      await wasenderDeleteSession(cfg, row.external_session_id)
    } catch {
      // still remove local mapping
    }
  } else if (cfg.provider === 'waha') {
    try {
      await wahaFetch(`/api/sessions/${encodeURIComponent(sessionName)}`, { method: 'DELETE' }, { userId })
    } catch {
      // still remove local mapping
    }
  }

  const admin = createServiceRoleClient()
  await admin.from('waha_user_sessions').delete().eq('user_id', userId).eq('session_name', sessionName)
}

export async function deleteAllWhatsAppSessionsForUser(userId: string): Promise<number> {
  const rows = await loadUserWhatsAppSessions(userId)
  let deleted = 0
  for (const row of rows) {
    try {
      await deleteWhatsAppSession(userId, row.session_name)
      deleted += 1
    } catch (e) {
      console.error('[whatsapp] deleteAllWhatsAppSessionsForUser failed:', userId, row.session_name, e)
    }
  }
  return deleted
}

export async function getWhatsAppProviderForUser(userId: string): Promise<WhatsAppProvider> {
  const cfg = await getWhatsAppServerConfig({ userId })
  return cfg.provider
}
