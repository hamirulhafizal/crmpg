export type WhatsAppProvider = 'waha' | 'wasender'

export type WhatsAppServerConfig = {
  serverId: string | null
  provider: WhatsAppProvider
  baseUrl: string
  platformApiKey: string
  dashboardPass: string | null
}

export type UserWhatsAppSessionRow = {
  id: string
  user_id: string
  session_name: string
  provider_type: WhatsAppProvider
  external_session_id: string | null
  session_api_key: string | null
  last_known_waha_status: string | null
}

/** Normalized session shape returned to UI (WAHA + Wasender). */
export type WhatsAppSessionView = {
  name: string
  status: string
  provider: WhatsAppProvider
  externalSessionId?: string | null
  me?: { id?: string; pushName?: string } | null
  engine?: { engine?: string }
}

export type WhatsAppSendLogContext = {
  campaignId?: string
  campaignName?: string
  ownerUserId?: string
  enrollmentId?: string
  customerLabel?: string
  stepOrder?: number
}

export type WhatsAppSendTextParams = {
  userId: string
  session: string
  phone: string
  text: string
  enableTyping?: boolean
  randomizeSpaces?: boolean
  logContext?: WhatsAppSendLogContext
}

export type WhatsAppSendImageParams = {
  userId: string
  session: string
  phone: string
  imageBytes: Buffer
  caption?: string
  enableTyping?: boolean
  mimetype?: string
  filename?: string
  logContext?: WhatsAppSendLogContext
}

export type ChatHistoryRow = {
  id: string
  text: string
  timestamp: number | null
  fromMe: boolean
}

export type WhatsAppLabel = {
  id?: string | number
  name?: string
  color?: number
  colorHex?: string
}
