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
    const { customer_ids, message_template } = body

    if (!customer_ids || !Array.isArray(customer_ids) || customer_ids.length === 0) {
      return NextResponse.json(
        { error: 'customer_ids array is required' },
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

    // Get customers
    const { data: customers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .in('id', customer_ids)

    if (customersError || !customers || customers.length === 0) {
      return NextResponse.json(
        { error: 'No customers found' },
        { status: 404 }
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

    const results = {
      total: customers.length,
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [] as any[],
    }

    // Send messages one by one (with delay to avoid rate limiting)
    for (const customer of customers) {
      // Skip if no phone number
      if (!customer.phone) {
        results.skipped++
        results.details.push({
          customer_id: customer.id,
          name: customer.name,
          status: 'skipped',
          reason: 'No phone number',
        })
        continue
      }

      // Format phone number
      let phoneNumber = customer.phone.replace(/[^0-9]/g, '')
      if (!phoneNumber.startsWith('60')) {
        if (phoneNumber.startsWith('0')) {
          phoneNumber = '60' + phoneNumber.substring(1)
        } else {
          phoneNumber = '60' + phoneNumber
        }
      }

      // Replace template variables
      const message = replaceTemplateVariables(template, customer)

      try {
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
        const success = sendResponse.ok && sendResult.status !== false

        // Get birthday date
        const dob = customer.dob ? new Date(customer.dob) : null
        const birthdayDate = dob ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}` : null
        const currentYear = new Date().getFullYear()

        // Record message in database
        const messageStatus = success ? 'sent' : 'failed'
        
        await supabase
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

        if (success) {
          results.sent++
          results.details.push({
            customer_id: customer.id,
            name: customer.name,
            status: 'sent',
          })
        } else {
          results.failed++
          results.details.push({
            customer_id: customer.id,
            name: customer.name,
            status: 'failed',
            error: sendResult.msg || sendResult.message || 'Unknown error',
          })
        }

        // Update connection message count
        if (success) {
          await supabase
            .from('whatsapp_connections')
            .update({
              messages_sent: (connection.messages_sent || 0) + 1,
            })
            .eq('id', connection.id)
        }

        // Delay between messages to avoid rate limiting (500ms)
        await new Promise(resolve => setTimeout(resolve, 500))
      } catch (error: any) {
        results.failed++
        results.details.push({
          customer_id: customer.id,
          name: customer.name,
          status: 'failed',
          error: error.message || 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: results.sent > 0,
      results,
      message: `Sent ${results.sent} messages, ${results.failed} failed, ${results.skipped} skipped`,
    })
  } catch (error: any) {
    console.error('Error sending bulk birthday messages:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
