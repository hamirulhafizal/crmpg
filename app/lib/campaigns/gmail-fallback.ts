import {
  formatLastPurchaseForTemplate,
  formatRegistrationForTemplate,
} from '@/app/lib/customer-account-status'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import nodemailer from 'nodemailer'

export type GmailFallbackCustomer = {
  id: string
  email?: string | null
  name?: string | null
  dob?: string | null
  phone?: string | null
  location?: string | null
  gender?: string | null
  ethnicity?: string | null
  age?: number | null
  prefix?: string | null
  first_name?: string | null
  sender_name?: string | null
  save_name?: string | null
  pg_code?: string | null
  original_data?: unknown
  created_at?: string | null
  last_purchase_at?: string | null
}

type EmailFallbackConfig = {
  fromEmail: string
  appPassword: string
  gmailTemplate: string | null
}

function renderGmailTemplate(template: string, customer: GmailFallbackCustomer): string {
  if (!template) return ''

  const lastPurchase = formatLastPurchaseForTemplate(customer)
  const registration = formatRegistrationForTemplate(
    customer.original_data,
    customer.created_at ?? undefined
  )

  return template
    .replace(/{Name}/g, customer.name || '')
    .replace(/{DOB}/g, customer.dob || '')
    .replace(/{Email}/g, customer.email || '')
    .replace(/{Phone}/g, customer.phone || '')
    .replace(/{Location}/g, customer.location || '')
    .replace(/{Gender}/g, customer.gender || '')
    .replace(/{Ethnicity}/g, customer.ethnicity || '')
    .replace(/{Age}/g, customer.age != null ? String(customer.age) : '')
    .replace(/{Prefix}/g, customer.prefix || '')
    .replace(/{FirstName}/g, customer.first_name || '')
    .replace(/{SenderName}/g, customer.sender_name || customer.name || '')
    .replace(/{SaveName}/g, customer.save_name || '')
    .replace(/{PGCode}/g, customer.pg_code || '')
    .replace(/{LastPurchaseDate}/g, lastPurchase)
    .replace(/{RegistrationDate}/g, registration)
}

export async function getEmailFallbackConfig(userId: string): Promise<EmailFallbackConfig | null> {
  const supabase = createServiceRoleClient()
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select('gmail_app_password, gmail_message')
    .eq('id', userId)
    .maybeSingle()

  if (profileError || !profileRow) return null

  const appPassword = (profileRow.gmail_app_password || '').trim()
  if (!appPassword) return null

  const { data, error } = await supabase.auth.admin.getUserById(userId)
  if (error || !data?.user?.email) return null

  const gmailTemplate =
    typeof profileRow.gmail_message === 'string'
      ? profileRow.gmail_message
      : profileRow.gmail_message != null
        ? String(profileRow.gmail_message)
        : null

  return {
    fromEmail: data.user.email,
    appPassword,
    gmailTemplate,
  }
}

/** Returns true when profile has Gmail app password + message template configured. */
export async function isGmailFallbackConfigured(userId: string): Promise<boolean> {
  const cfg = await getEmailFallbackConfig(userId)
  return Boolean(cfg?.gmailTemplate?.trim())
}

/**
 * Send Gmail fallback email. Uses `templateOverride` (step node) when set, else profile Gmail message.
 * Returns false when skipped (no email, no SMTP credentials, no template, or SMTP error).
 */
export async function sendCampaignEmailFallback(
  userId: string,
  customer: GmailFallbackCustomer,
  templateOverride?: string | null
): Promise<boolean> {
  if (!customer.email?.trim()) return false

  const cfg = await getEmailFallbackConfig(userId)
  if (!cfg) return false

  const template = (templateOverride ?? '').trim() || (cfg.gmailTemplate ?? '').trim()
  if (!template) return false

  const renderedText = renderGmailTemplate(template, customer)

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: cfg.fromEmail,
        pass: cfg.appPassword,
      },
    })

    await transporter.sendMail({
      from: cfg.fromEmail,
      to: customer.email.trim(),
      subject: 'Public Gold',
      text: renderedText,
    })

    return true
  } catch (err) {
    console.error('[campaign] Gmail fallback send failed:', err)
    return false
  }
}
