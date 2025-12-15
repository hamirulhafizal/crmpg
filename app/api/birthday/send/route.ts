import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || 'https://ustazai.my/'

function replaceTemplateVariables(template: string, customer: any): string {
  return template
    .replace(/{Name}/g, customer.name || '')
    .replace(/{SenderName}/g, customer.sender_name || customer.name || '')
    .replace(/{SaveName}/g, customer.save_name || '')
    .replace(/{Age}/g, customer.age?.toString() || '')
    .replace(/{PGCode}/g, customer.pg_code || '')
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { customer_id, message_template } = body

    if (!customer_id) {
      return NextResponse.json(
        { error: 'customer_id is required' },
        { status: 400 }
      )
    }

    // Get customer
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', customer_id)
      .eq('user_id', user.id)
      .single()

    if (customerError || !customer) {
      return NextResponse.json(
        { error: 'Customer not found' },
        { status: 404 }
      )
    }

    // Validate customer has phone number
    if (!customer.phone) {
      return NextResponse.json(
        { error: 'Customer does not have a phone number' },
        { status: 400 }
      )
    }

    // Get WhatsApp connection
    const { data: connection, error: connectionError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('user_id', user.id)
      .eq('device_status', 'Connected')
      .single()

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: 'WhatsApp not connected. Please connect your WhatsApp first.' },
        { status: 400 }
      )
    }

    // Get user's message template settings
    const { data: settings } = await supabase
      .from('whatsapp_settings')
      .select('default_template')
      .eq('user_id', user.id)
      .single()

    const template = message_template || settings?.default_template || 
      'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂'

    // Replace template variables
    const message = replaceTemplateVariables(template, customer)

    // Format phone number (ensure it starts with 60)
    let phoneNumber = customer.phone.replace(/[^0-9]/g, '') // Remove non-digits
    if (!phoneNumber.startsWith('60')) {
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '60' + phoneNumber.substring(1)
      } else {
        phoneNumber = '60' + phoneNumber
      }
    }

    // Send message via WhatsApp API
    const sendResponse = await fetch(`${WHATSAPP_API_ENDPOINT}send-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: connection.api_key,
        sender: connection.sender_number,
        number: phoneNumber,
        message: message,
      }),
    })

    const sendResult = await sendResponse.json()

    // Get birthday date
    const dob = customer.dob ? new Date(customer.dob) : null
    const birthdayDate = dob ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}` : null

    // Record message in database
    const messageStatus = sendResponse.ok && sendResult.status !== false ? 'sent' : 'failed'
    const currentYear = new Date().getFullYear()
    
    const { data: birthdayMessage, error: messageError } = await supabase
      .from('birthday_messages')
      .insert({
        user_id: user.id,
        customer_id: customer.id,
        whatsapp_connection_id: connection.id,
        recipient_number: phoneNumber,
        message_sent: message,
        message_status: messageStatus,
        birthday_date: birthdayDate || new Date().toISOString().split('T')[0],
        sent_year: currentYear, // Set sent_year for unique constraint
      })
      .select()
      .single()

    // Update connection message count
    if (messageStatus === 'sent') {
      await supabase
        .from('whatsapp_connections')
        .update({
          messages_sent: (connection.messages_sent || 0) + 1,
        })
        .eq('id', connection.id)
    }

    if (messageError) {
      console.error('Error saving birthday message:', messageError)
    }

    if (!sendResponse.ok || sendResult.status === false) {
      return NextResponse.json({
        success: false,
        error: sendResult.msg || sendResult.message || 'Failed to send message',
        message_recorded: !!birthdayMessage,
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Birthday message sent successfully',
      message_id: birthdayMessage?.id,
    })
  } catch (error: any) {
    console.error('Error sending birthday message:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
