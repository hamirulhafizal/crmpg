import { normalizePhoneToMsisdn } from '@/app/lib/phone-msisdn'
import { fetchWahaChatMessages } from '@/app/lib/waha-chat-messages'
import type { WahaAttempt } from '@/app/lib/waha'
import { wasenderGetMessageLogs } from '@/app/lib/wasender'
import {
  getWhatsAppServerConfig,
  loadUserWhatsAppSession,
} from '@/app/lib/whatsapp/resolve'
import type { ChatHistoryRow } from '@/app/lib/whatsapp/types'

export type { WahaAttempt }

function mapWasenderLogsToChatHistory(
  logs: Array<{ id?: string; to?: string | null; content?: string | null; created_at?: string }>,
  targetMsisdn: string
): ChatHistoryRow[] {
  const suffix = targetMsisdn.slice(-8)
  return logs
    .filter((row) => {
      const to = (row.to || '').replace(/\D/g, '')
      return !to || to.endsWith(suffix) || to.includes(targetMsisdn)
    })
    .map((row, idx) => {
      let text = ''
      if (row.content) {
        try {
          const parsed = JSON.parse(row.content) as { text?: string }
          text = typeof parsed.text === 'string' ? parsed.text : row.content
        } catch {
          text = row.content
        }
      }
      const ts = row.created_at ? Date.parse(row.created_at.replace(' ', 'T')) : null
      return {
        id: row.id || `wasender-log-${idx}`,
        text: text.trim(),
        timestamp: ts && Number.isFinite(ts) ? ts : null,
        fromMe: true,
      }
    })
    .filter((m) => m.text.length > 0)
}

function mapWahaRows(rows: unknown[]): ChatHistoryRow[] {
  return rows
    .filter((x) => x && typeof x === 'object')
    .map((x, idx) => {
      const m = x as Record<string, unknown>
      const text =
        typeof m.body === 'string'
          ? m.body
          : typeof m.text === 'string'
            ? m.text
            : ''
      const t = m.timestamp
      const timestamp = typeof t === 'number' ? (t > 1e12 ? t : t * 1000) : null
      return {
        id: typeof m.id === 'string' ? m.id : `waha-${idx}`,
        text: text.trim(),
        timestamp,
        fromMe: m.fromMe === true,
      }
    })
    .filter((m) => m.text.length > 0)
}

export async function fetchWhatsAppChatMessages(
  userId: string,
  sessionName: string,
  phone: string,
  limit = 80
): Promise<{ messages: ChatHistoryRow[]; attempts?: WahaAttempt[] }> {
  const cfg = await getWhatsAppServerConfig({ userId })
  const msisdn = normalizePhoneToMsisdn(phone)
  const chatId = `${msisdn}@c.us`

  if (cfg.provider === 'wasender') {
    const row = await loadUserWhatsAppSession(userId)
    if (!row?.session_api_key || !row.external_session_id) {
      return { messages: [] }
    }
    const logs = await wasenderGetMessageLogs(cfg, row.session_api_key, row.external_session_id, 1, limit)
    return { messages: mapWasenderLogsToChatHistory(logs, msisdn) }
  }

  const fetched = await fetchWahaChatMessages(sessionName, chatId, userId, limit)
  return { messages: mapWahaRows(fetched.messages) }
}
