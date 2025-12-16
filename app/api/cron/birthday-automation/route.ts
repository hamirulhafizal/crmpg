import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || 'https://ustazai.my/'

// This endpoint will be called by Supabase pg_cron every hour
// The cron job checks each user's scheduled time and sends messages accordingly
export async function GET(request: Request) {
  // Verify cron secret (for security)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = await createClient()
    
    // Get current time in Malaysia timezone
    const now = new Date()
    const malaysiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
    const currentHour = malaysiaTime.getHours()
    const currentMinute = malaysiaTime.getMinutes()
    const currentDate = malaysiaTime.toISOString().split('T')[0]

    // Get all users with auto-send enabled
    const { data: settings, error: settingsError } = await supabase
      .from('whatsapp_settings')
      .select('user_id, send_time, default_template')
      .eq('auto_send_enabled', true)

    if (settingsError) {
      console.error('Error fetching settings:', settingsError)
      return NextResponse.json(
        { error: settingsError.message },
        { status: 500 }
      )
    }

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Process each user
    for (const setting of settings || []) {
      try {
        // Parse scheduled time (format: HH:MM:SS or HH:MM)
        const timeParts = setting.send_time.split(':')
        const sendHour = parseInt(timeParts[0])
        const sendMinute = parseInt(timeParts[1] || '0')
        
        // Check if it's time to send (must match both hour and minute)
        // Allow a 1-minute window (current minute should be sendMinute or sendMinute+1)
        // This accounts for slight timing differences
        if (currentHour !== sendHour || (currentMinute !== sendMinute && currentMinute !== sendMinute + 1)) {
          continue // Skip if not the right time
        }

        // Get user's WhatsApp connection
        const { data: connection } = await supabase
          .from('whatsapp_connections')
          .select('*')
          .eq('user_id', setting.user_id)
          .eq('device_status', 'Connected')
          .single()

        if (!connection) {
          results.errors.push(`User ${setting.user_id}: No active WhatsApp connection`)
          continue
        }

        // Get customers with birthdays today
        const { data: customers } = await supabase
          .from('customers')
          .select('*')
          .eq('user_id', setting.user_id)
          .not('dob', 'is', null)
          .not('phone', 'is', null)

        if (!customers || customers.length === 0) {
          continue
        }

        // Filter customers with birthdays today
        const todayBirthdays = customers.filter(customer => {
          if (!customer.dob) return false
          const dob = new Date(customer.dob)
          const today = new Date(currentDate)
          return dob.getMonth() === today.getMonth() && dob.getDate() === today.getDate()
        })

        // Check which customers already received messages today
        const { data: sentMessages } = await supabase
          .from('birthday_messages')
          .select('customer_id')
          .eq('user_id', setting.user_id)
          .gte('sent_at', `${currentDate}T00:00:00Z`)
          .lte('sent_at', `${currentDate}T23:59:59Z`)

        const sentCustomerIds = new Set(sentMessages?.map(m => m.customer_id) || [])
        const customersToSend = todayBirthdays.filter(c => !sentCustomerIds.has(c.id))

        if (customersToSend.length === 0) {
          continue
        }

        // Send messages to each customer
        for (const customer of customersToSend) {
          try {
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
            const template = setting.default_template || 
              'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂'
            
            const message = template
              .replace(/{Name}/g, customer.name || '')
              .replace(/{SenderName}/g, customer.sender_name || customer.name || '')
              .replace(/{SaveName}/g, customer.save_name || '')
              .replace(/{Age}/g, customer.age?.toString() || '')
              .replace(/{PGCode}/g, customer.pg_code || '')

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

            // Record message
            const dob = customer.dob ? new Date(customer.dob) : null
            const birthdayDate = dob ? `${dob.getFullYear()}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}` : currentDate
            const currentYear = new Date().getFullYear()

            await supabase
              .from('birthday_messages')
              .insert({
                user_id: setting.user_id,
                customer_id: customer.id,
                whatsapp_connection_id: connection.id,
                recipient_number: phoneNumber,
                message_sent: message,
                message_status: success ? 'sent' : 'failed',
                birthday_date: birthdayDate,
                sent_year: currentYear, // Set sent_year for unique constraint
              })

            if (success) {
              results.sent++
              // Update connection message count
              await supabase
                .from('whatsapp_connections')
                .update({
                  messages_sent: (connection.messages_sent || 0) + 1,
                })
                .eq('id', connection.id)
            } else {
              results.failed++
            }

            // Delay between messages
            await new Promise(resolve => setTimeout(resolve, 1000))
          } catch (err: any) {
            results.failed++
            results.errors.push(`Customer ${customer.id}: ${err.message}`)
          }
        }

        results.processed++
      } catch (err: any) {
        results.errors.push(`User ${setting.user_id}: ${err.message}`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${results.processed} users, sent ${results.sent} messages, ${results.failed} failed`,
      results,
    })
  } catch (error: any) {
    console.error('Error in birthday automation cron:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


