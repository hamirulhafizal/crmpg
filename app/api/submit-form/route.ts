import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

import { sendGapLeadWhatsAppMessages } from '@/app/lib/gap-lead-whatsapp'
import { createServiceRoleClient } from '@/app/lib/supabase/service-role'
import { loadActiveGoogleAdsDealers } from '@/app/lib/google-ads/active-dealers-for-leads'
import { registerCustomerAtPublicGold } from '@/app/lib/public-gold-registration'

function normalizePhoneForMatch(value: unknown): string {
  if (value == null) return ''
  let digits = String(value).replace(/\D/g, '')
  if (!digits) return ''
  if (digits.startsWith('0')) digits = `60${digits.slice(1)}`
  if (!digits.startsWith('60')) digits = `60${digits}`
  return digits
}

function normalizeEmailForMatch(value: unknown): string {
  if (value == null) return ''
  return String(value).trim().toLowerCase()
}

function buildLeadBody(formData: Record<string, unknown>, dealerEmail: string): string {
  const fullName = String(formData.fullName ?? '')
  const email = String(formData.email ?? '')
  const ic = String(formData.icNumber ?? '')
  const phone = String(formData.phone ?? '')
  const location = String(formData.location ?? '')
  return `New GAP registration received:

Name: ${fullName}
Email: ${email}
IC: ${ic}
Phone: +6${phone}

Customer form --------------------------------->
Location: ${location}
For Dealer: ${dealerEmail}
`
}

export async function POST(req: Request) {
  try {
    const formData = (await req.json()) as Record<string, unknown>
    const toEmail = typeof formData.dealerEmail === 'string' ? formData.dealerEmail.trim() : ''
    const dealerPhoneRaw =
      typeof formData.dealerPhone === 'string' ? formData.dealerPhone.trim() : ''

    if (!toEmail) {
      return NextResponse.json({ success: false, error: 'Missing dealer email' }, { status: 400 })
    }

    const bodyText = buildLeadBody(formData, toEmail)

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
      },
    })

    await transporter.sendMail({
      from: process.env.GMAIL_USER,
      to: toEmail,
      subject: 'New GAP Registration',
      text: bodyText,
    })

    let whatsappSent = false
    let whatsappSkipped: string | undefined
    let whatsappError: string | undefined
    let publicGoldAutomation:
      | {
          attempted: boolean
          success: boolean
          introPgCode?: string
          statusText?: string
          finalUrl?: string
          error?: string
        }
      | undefined
    let customerInsert:
      | {
          attempted: boolean
          inserted: boolean
          skippedReason?: string
          customerId?: string
          dealerUserId?: string
          error?: string
        }
      | undefined

    try {
      const dealerPhone =
        dealerPhoneRaw
      const wa = await sendGapLeadWhatsAppMessages({
        dealerPhone: dealerPhone || undefined,
        text: bodyText,
      })
      whatsappSent = wa.sentToDealer || wa.sentCc
      if (!whatsappSent && wa.skipReason) whatsappSkipped = wa.skipReason
    } catch (e: unknown) {
      whatsappError = e instanceof Error ? e.message : 'WhatsApp send failed'
      console.error('GAP lead WAHA error:', e)
    }

    try {
      const admin = createServiceRoleClient()
      const { dealers } = await loadActiveGoogleAdsDealers(admin)
      const matchedDealer = dealers.find((d) => d.email.toLowerCase() === toEmail.toLowerCase())
      const introPgCode = matchedDealer?.pgcode?.trim()

      if (!introPgCode || introPgCode === '—') {
        publicGoldAutomation = {
          attempted: false,
          success: false,
          error: 'Dealer PG code not found for automation.',
        }
      } else {
        const fullName = String(formData.fullName ?? '').trim()
        const icNumber = String(formData.icNumber ?? '').trim()
        const email = String(formData.email ?? '').trim()
        const phone = String(formData.phone ?? '').trim()
        const location = String(formData.location ?? '').trim()

        if (!fullName || !icNumber || !email || !phone) {
          publicGoldAutomation = {
            attempted: false,
            success: false,
            introPgCode,
            error: 'Missing required lead fields for Public Gold registration.',
          }
        } else {
          const dealerPhoneRaw =
            typeof formData.dealerPhone === 'string' ? formData.dealerPhone.trim() : ''
          const introducerPhone =
            (matchedDealer?.no_tel && String(matchedDealer.no_tel).trim()) || dealerPhoneRaw || ''

          const result = await registerCustomerAtPublicGold({
            fullName,
            icNumber,
            email,
            phone,
            location,
            introPgCode,
            ...(introducerPhone ? { introducerPhone } : {}),
          })

          publicGoldAutomation = {
            attempted: true,
            success: result.ok,
            introPgCode,
            statusText: result.statusText,
            finalUrl: result.finalUrl,
          }
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Public Gold automation failed'
      console.error('Public Gold automation error:', e)
      publicGoldAutomation = {
        attempted: true,
        success: false,
        error: message,
      }
    }

    // Also persist this lead into CRM customers table under matched dealer.
    try {
      const admin = createServiceRoleClient()
      const { dealers } = await loadActiveGoogleAdsDealers(admin)
      const dealerByEmail = toEmail
        ? dealers.find((d) => d.email.toLowerCase() === toEmail.toLowerCase())
        : null
      const normalizedDealerPhone = normalizePhoneForMatch(dealerPhoneRaw)
      const dealerByPhone =
        !dealerByEmail && normalizedDealerPhone
          ? dealers.find((d) => normalizePhoneForMatch(d.no_tel || '') === normalizedDealerPhone)
          : null
      const matchedDealer = dealerByEmail || dealerByPhone || null

      if (!matchedDealer?.user_id) {
        customerInsert = {
          attempted: true,
          inserted: false,
          skippedReason: 'dealer_not_found',
        }
      } else {
        const fullName = String(formData.fullName ?? '').trim()
        const email = String(formData.email ?? '').trim()
        const phone = normalizePhoneForMatch(formData.phone)
        const location = String(formData.location ?? '').trim()
        const icNumber = String(formData.icNumber ?? '').trim()

        if (!fullName || (!email && !phone)) {
          customerInsert = {
            attempted: true,
            inserted: false,
            skippedReason: 'missing_required_lead_fields',
            dealerUserId: matchedDealer.user_id,
          }
        } else {
          let existingCustomerId: string | null = null
          const normalizedEmail = normalizeEmailForMatch(email)

          if (normalizedEmail) {
            const { data: existingByEmail } = await admin
              .from('customers')
              .select('id')
              .eq('user_id', matchedDealer.user_id)
              .eq('email_normalized', normalizedEmail)
              .limit(1)
              .maybeSingle()
            if (existingByEmail?.id) existingCustomerId = existingByEmail.id
          }

          if (!existingCustomerId && phone) {
            const { data: existingByPhone } = await admin
              .from('customers')
              .select('id')
              .eq('user_id', matchedDealer.user_id)
              .eq('phone_e164', phone)
              .limit(1)
              .maybeSingle()
            if (existingByPhone?.id) existingCustomerId = existingByPhone.id
          }

          if (existingCustomerId) {
            customerInsert = {
              attempted: true,
              inserted: false,
              skippedReason: 'duplicate_existing_customer',
              customerId: existingCustomerId,
              dealerUserId: matchedDealer.user_id,
            }
          } else {
            const nowIso = new Date().toISOString()
            const { data: insertedRow, error: insertErr } = await admin
              .from('customers')
              .insert({
                user_id: matchedDealer.user_id,
                name: fullName,
                email: email || null,
                phone: phone || null,
                location: location || null,
                segment_attributes: {
                  source: 'google_ads',
                  acquisition_source: 'google_ads',
                  channel: 'online',
                },
                original_data: {
                  Source: 'GAP registration form',
                  'IC Number': icNumber || null,
                  'Submitted At': nowIso,
                  'Dealer Email': toEmail || null,
                  'Dealer Phone': dealerPhoneRaw || null,
                },
                last_synced_at: nowIso,
              })
              .select('id')
              .single()

            if (insertErr) {
              customerInsert = {
                attempted: true,
                inserted: false,
                dealerUserId: matchedDealer.user_id,
                error: insertErr.message,
              }
            } else {
              customerInsert = {
                attempted: true,
                inserted: true,
                customerId: insertedRow?.id,
                dealerUserId: matchedDealer.user_id,
              }
            }
          }
        }
      }
    } catch (e: unknown) {
      customerInsert = {
        attempted: true,
        inserted: false,
        error: e instanceof Error ? e.message : 'Failed to insert customer lead',
      }
      console.error('CRM customer insert from GAP form failed:', e)
    }

    return NextResponse.json({
      success: true,
      whatsappSent,
      ...(whatsappSkipped ? { whatsappSkipped } : {}),
      ...(whatsappError ? { whatsappError } : {}),
      ...(publicGoldAutomation ? { publicGoldAutomation } : {}),
      ...(customerInsert ? { customerInsert } : {}),
    })
  } catch (error: unknown) {
    console.error('Error sending lead:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
