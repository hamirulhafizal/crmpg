import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { mapWasenderStatusToDisplay, wasenderListAllSessions } from '@/app/lib/wasender'
import type { WhatsAppProvider, WhatsAppServerConfig } from '@/app/lib/whatsapp/types'

export type AdminLiveSessionLookup = {
  bySessionName: Map<string, string>
  byExternalId: Map<string, string>
}

export type AdminWahaServerRow = {
  id: string
  api_base_url: string
  api_key: string
  provider_type?: WhatsAppProvider | string | null
}

function normalizeBaseUrl(url: string): string {
  return (url || '').trim().replace(/\/+$/, '')
}

function inferProvider(row: AdminWahaServerRow): WhatsAppProvider {
  if (row.provider_type === 'wasender') return 'wasender'
  const base = normalizeBaseUrl(row.api_base_url)
  if (base.toLowerCase().includes('wasenderapi.com')) return 'wasender'
  return 'waha'
}

export function adminServerRowToConfig(row: AdminWahaServerRow): WhatsAppServerConfig {
  const provider = inferProvider(row)
  return {
    serverId: row.id,
    provider,
    baseUrl:
      normalizeBaseUrl(row.api_base_url) || (provider === 'wasender' ? 'https://wasenderapi.com' : ''),
    platformApiKey: (row.api_key || '').trim(),
    dashboardPass: null,
  }
}

function phoneToSessionKey(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return ''
  try {
    return normalizePhoneToMsisdn(digits.startsWith('+') ? phone : digits)
  } catch {
    return digits
  }
}

export async function fetchWahaLiveSessionLookup(
  apiBaseUrl: string,
  apiKey: string
): Promise<AdminLiveSessionLookup | null> {
  const base = normalizeBaseUrl(apiBaseUrl)
  if (!base || !apiKey) return null

  try {
    const res = await fetch(`${base}/api/sessions?all=true`, {
      headers: { 'X-Api-Key': apiKey },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json().catch(() => [])) as Array<{ name?: string; status?: string }>
    const bySessionName = new Map<string, string>()
    const byExternalId = new Map<string, string>()
    for (const row of Array.isArray(data) ? data : []) {
      const name = (row?.name || '').trim()
      const status = (row?.status || '').toString()
      if (name) bySessionName.set(name, status)
    }
    return { bySessionName, byExternalId }
  } catch {
    return null
  }
}

export async function fetchWasenderLiveSessionLookup(
  cfg: WhatsAppServerConfig
): Promise<AdminLiveSessionLookup | null> {
  if (!cfg.platformApiKey) return null

  try {
    const sessions = await wasenderListAllSessions(cfg)
    const bySessionName = new Map<string, string>()
    const byExternalId = new Map<string, string>()

    for (const session of sessions) {
      const display = mapWasenderStatusToDisplay((session.status || 'disconnected').toString())
      byExternalId.set(String(session.id), display)

      if (session.phone_number) {
        const key = phoneToSessionKey(session.phone_number)
        if (key) bySessionName.set(key, display)
      }

      const nameDigits = (session.name || '').replace(/\D/g, '')
      if (nameDigits.length >= 8) {
        const key = phoneToSessionKey(nameDigits)
        if (key) bySessionName.set(key, display)
      }
    }

    return { bySessionName, byExternalId }
  } catch {
    return null
  }
}

export async function fetchLiveSessionLookupForServer(
  row: AdminWahaServerRow
): Promise<AdminLiveSessionLookup | null> {
  if (inferProvider(row) === 'wasender') {
    return fetchWasenderLiveSessionLookup(adminServerRowToConfig(row))
  }
  return fetchWahaLiveSessionLookup(row.api_base_url, row.api_key)
}

export function resolveLiveStatusFromLookup(
  lookup: AdminLiveSessionLookup | null | undefined,
  session: { session_name: string; external_session_id?: string | null }
): string | null {
  if (!lookup) return null

  const extId = (session.external_session_id || '').trim()
  if (extId && lookup.byExternalId.has(extId)) {
    return lookup.byExternalId.get(extId) || null
  }

  const name = (session.session_name || '').trim()
  if (name && lookup.bySessionName.has(name)) {
    return lookup.bySessionName.get(name) || null
  }

  return null
}

/** True when the provider session list was fetched and includes this mapping. */
export function isSessionInProviderLookup(
  lookup: AdminLiveSessionLookup | null | undefined,
  session: { session_name: string; external_session_id?: string | null }
): boolean {
  return resolveLiveStatusFromLookup(lookup, session) != null
}

/**
 * Resolve admin-visible session status.
 * When the provider list is available, it is the source of truth — stale session API keys are ignored.
 */
export function resolveAdminSessionStatus(
  lookup: AdminLiveSessionLookup | null | undefined,
  session: { session_name: string; external_session_id?: string | null },
  options?: { storedStatus?: string | null }
): string {
  const fromLookup = resolveLiveStatusFromLookup(lookup, session)
  if (fromLookup) return fromLookup
  if (lookup) return 'STOPPED'
  const stored = (options?.storedStatus || '').trim()
  return stored || 'STOPPED'
}

export function isWasenderServer(row: AdminWahaServerRow | null | undefined): boolean {
  if (!row) return false
  return inferProvider(row) === 'wasender'
}
