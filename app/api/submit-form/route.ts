import { NextResponse } from 'next/server'
import nodemailer from 'nodemailer'

import { sendGapLeadWhatsAppMessages } from '@/app/lib/gap-lead-whatsapp'

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

    try {
      const dealerPhone =
        typeof formData.dealerPhone === 'string' ? formData.dealerPhone.trim() : ''
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

    return NextResponse.json({
      success: true,
      whatsappSent,
      ...(whatsappSkipped ? { whatsappSkipped } : {}),
      ...(whatsappError ? { whatsappError } : {}),
    })
  } catch (error: unknown) {
    console.error('Error sending lead:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
