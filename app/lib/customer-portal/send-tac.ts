import nodemailer from 'nodemailer'
import { sleep } from '@/app/lib/campaigns/whatsapp-humanize'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import {
  getWhatsAppServerConfig,
  isWhatsAppConfigured,
  loadUserWhatsAppSession,
  loadUserWhatsAppSessionByName,
  resolveEffectiveWhatsAppProvider,
} from '@/app/lib/whatsapp/resolve'
import { sendWhatsAppText as deliverWhatsAppText } from '@/app/lib/whatsapp/send'
import { PORTAL_BRAND } from '@/app/lib/customer-portal/brand'

/** Wasender account protection allows ~1 outbound message per 5s. */
const WASENDER_TAC_GAP_MS = Math.min(
  Math.max(Number(process.env.WASENDER_TAC_GAP_MS || 5500) || 5500, 5000),
  15000
)

async function pickWahaSession(userId: string): Promise<string | null> {
  const admin = createServiceRoleClient()
  const { data: rows } = await admin
    .from('waha_user_sessions')
    .select('session_name, last_known_waha_status')
    .eq('user_id', userId)

  const list = rows ?? []
  const working = list.find((r) => {
    const s = String(r.last_known_waha_status || '').toUpperCase()
    return s === 'WORKING' || s === 'CONNECTED'
  })
  if (working?.session_name) return working.session_name
  return list[0]?.session_name ?? null
}

function tacIntroMessage(pgCode?: string | null): string {
  const pgLabel = pgCode?.trim() ? ` (${pgCode.trim()})` : ''
  return (
    `${PORTAL_BRAND} — verification code${pgLabel}\n\n` +
    `Valid for 10 minutes. Do not share this code with anyone.\n\n` +
    `Your login code is below: 👇🏻👇🏻👇🏻`
  )
}

function isDeliverableEmail(email: string): boolean {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed.includes('@')) return false
  const domain = trimmed.split('@')[1] || ''
  return domain !== 'invalid.local' && !domain.endsWith('.invalid')
}

async function getGmailSmtp(userId: string): Promise<{ fromEmail: string; appPassword: string } | null> {
  const admin = createServiceRoleClient()
  const { data: profileRow, error: profileError } = await admin
    .from('profiles')
    .select('gmail_app_password')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profileRow) return null
  const appPassword = (profileRow.gmail_app_password || '').trim()
  if (!appPassword) return null

  const { data, error } = await admin.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null

  return { fromEmail: data.user.email, appPassword }
}

async function sendWhatsAppTextMessages(params: {
  ownerUserId: string
  session: string
  phone: string
  messages: string[]
}): Promise<void> {
  const cfg = await getWhatsAppServerConfig({ userId: params.ownerUserId })
  const sessionRow =
    (await loadUserWhatsAppSessionByName(params.ownerUserId, params.session)) ??
    (await loadUserWhatsAppSession(params.ownerUserId))
  const provider = resolveEffectiveWhatsAppProvider(cfg, sessionRow)
  const gapMs = provider === 'wasender' ? WASENDER_TAC_GAP_MS : 0

  for (let i = 0; i < params.messages.length; i++) {
    if (i > 0 && gapMs > 0) await sleep(gapMs)
    await deliverWhatsAppText({
      userId: params.ownerUserId,
      session: params.session,
      phone: params.phone,
      text: params.messages[i],
      enableTyping: false,
      randomizeSpaces: false,
    })
  }
}

async function sendViaWhatsApp(params: {
  ownerUserId: string
  customerPhone: string
  code: string
  pgCode?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isWhatsAppConfigured({ userId: params.ownerUserId }))) {
    return { ok: false, error: 'WhatsApp is not configured.' }
  }

  const session = await pickWahaSession(params.ownerUserId)
  if (!session) {
    return { ok: false, error: 'No active WhatsApp session is available.' }
  }

  const intro = tacIntroMessage(params.pgCode)
  const codeOnly = params.code.trim()

  try {
    await sendWhatsAppTextMessages({
      ownerUserId: params.ownerUserId,
      session,
      phone: params.customerPhone,
      messages: [intro, codeOnly],
    })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send WhatsApp message'
    return { ok: false, error: message }
  }
}

async function sendViaEmail(params: {
  ownerUserId: string
  customerEmail: string
  code: string
  pgCode?: string | null
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const smtp = await getGmailSmtp(params.ownerUserId)
  if (!smtp) {
    return { ok: false, error: 'Email is not configured for your account manager.' }
  }

  const pgLabel = params.pgCode?.trim() ? ` (${params.pgCode.trim()})` : ''
  const text = `${tacIntroMessage(params.pgCode)}\n\n${params.code.trim()}`

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: smtp.fromEmail,
        pass: smtp.appPassword,
      },
    })

    await transporter.sendMail({
      from: smtp.fromEmail,
      to: params.customerEmail.trim(),
      subject: `${PORTAL_BRAND} — your login code${pgLabel}`,
      text,
    })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to send email'
    return { ok: false, error: message }
  }
}

export type DeliverTacResult =
  | { ok: true; channel: 'whatsapp' | 'email'; maskedDestination: string }
  | { ok: false; error: string }

export async function deliverCustomerPortalTac(params: {
  ownerUserId: string
  customerPhone: string | null | undefined
  customerEmail: string | null | undefined
  code: string
  pgCode?: string | null
}): Promise<DeliverTacResult> {
  const phone = params.customerPhone?.trim() || null
  const emailRaw = params.customerEmail?.trim() || null
  const email = emailRaw && isDeliverableEmail(emailRaw) ? emailRaw : null

  if (!phone && !email) {
    return {
      ok: false,
      error: 'This account has no phone or email on file. Please contact your dealer.',
    }
  }

  if (phone) {
    const wa = await sendViaWhatsApp({
      ownerUserId: params.ownerUserId,
      customerPhone: phone,
      code: params.code,
      pgCode: params.pgCode,
    })
    if (wa.ok) {
      return { ok: true, channel: 'whatsapp', maskedDestination: maskPhone(phone) }
    }

    if (email) {
      const mail = await sendViaEmail({
        ownerUserId: params.ownerUserId,
        customerEmail: email,
        code: params.code,
        pgCode: params.pgCode,
      })
      if (mail.ok) {
        return { ok: true, channel: 'email', maskedDestination: maskEmail(email) }
      }
      return {
        ok: false,
        error: `Could not send via WhatsApp (${wa.error}) or email (${mail.error}).`,
      }
    }

    return { ok: false, error: wa.error }
  }

  const mail = await sendViaEmail({
    ownerUserId: params.ownerUserId,
    customerEmail: email!,
    code: params.code,
    pgCode: params.pgCode,
  })
  if (mail.ok) {
    return { ok: true, channel: 'email', maskedDestination: maskEmail(email!) }
  }
  return { ok: false, error: mail.error }
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length <= 4) return '****'
  return `···${digits.slice(-4)}`
}

function maskEmail(email: string): string {
  const [local, domain] = email.split('@')
  if (!local || !domain) return '···'
  const visible = local.slice(0, Math.min(2, local.length))
  return `${visible}···@${domain}`
}
