import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || 'https://ustazai.my/'

// Helper function to replace template variables
function replaceTemplateVariables(template: string, customer: any): string {
  return template
    .replace(/{Name}/g, customer.name || '')
    .replace(/{SenderName}/g, customer.sender_name || customer.name || '')
    .replace(/{SaveName}/g, customer.save_name || '')
    .replace(/{Age}/g, customer.age?.toString() || '')
    .replace(/{PGCode}/g, customer.pg_code || '')
}

// This endpoint will be called by Supabase pg_cron every hour
// The cron job checks each user's scheduled time and sends messages accordingly
export async function GET(request: Request) {
  // Verify cron secret (for security) - but allow test calls without it
  const authHeader = request.headers.get('authorization')
  const isTestCall = request.headers.get('x-test-call') === 'true'
  
  if (!isTestCall && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = await createClient()
    
    // Get current date
    const now = new Date()
    const malaysiaTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kuala_Lumpur' }))
    const currentDate = malaysiaTime.toISOString().split('T')[0]
    const currentDay = malaysiaTime.getDate()
    const currentMonth = malaysiaTime.getMonth()

    // STEP 1: Fetch all customers with today's birthday (based on DOB)
    // Note: We can't use .eq() directly on DOB because it includes year
    // Instead, we fetch all customers and filter by month/day in JavaScript
    const { data: allCustomers, error: customersError } = await supabase
      .from('customers')
      .select('*')
      .not('dob', 'is', null)
      .not('phone', 'is', null)

      // console.log("allCustomers--->", allCustomers)

    if (customersError) {
      console.error('Error fetching customers:', customersError)
      return NextResponse.json(
        { error: customersError.message },
        { status: 500 }
      )
    }

    if (!allCustomers || allCustomers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No customers found',
        results: {
          processed: 0,
          sent: 0,
          failed: 0,
          errors: [],
        },
      })
    }

    // Filter customers with birthdays today (match month and day, ignore year)
    const todayBirthdays = allCustomers.filter(customer => {
      if (!customer.dob) return false
      const dob = new Date(customer.dob)
      // Compare month (0-indexed) and date (day of month)
      return dob.getMonth() === currentMonth && dob.getDate() === currentDay
    })

    // console.log("todayBirthdays--->", todayBirthdays)

    if (todayBirthdays.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No customers with birthdays today',
        results: {
          processed: 0,
          sent: 0,
          failed: 0,
          errors: [],
        },
      })
    }

    // STEP 2: Sort customers by user_id
    todayBirthdays.sort((a, b) => {
      if (a.user_id < b.user_id) return -1
      if (a.user_id > b.user_id) return 1
      return 0
    })

    // Group customers by user_id
    const customersByUserId = new Map<string, typeof todayBirthdays>()
    for (const customer of todayBirthdays) {
      const userId = customer.user_id
      if (!customersByUserId.has(userId)) {
        customersByUserId.set(userId, [])
      }
      customersByUserId.get(userId)!.push(customer)
    }

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
      errors: [] as string[],
      userResults: [] as Array<{ user_id: string; sent: number; failed: number }>,
    }

    // console.log("customersByUserId--->", customersByUserId)

    // STEP 3: Send birthday messages based on user_id WhatsApp connection
    // Process each user sequentially
    console.log(`[DEBUG] Starting to process ${customersByUserId.size} users`)
    for (const [userId, customers] of customersByUserId.entries()) {
      console.log(`[DEBUG] Processing user ${userId} with ${customers.length} customers`)
      try {
        // Get user's WhatsApp connection (must be connected)
        console.log(`[DEBUG] Fetching WhatsApp connection for user ${userId}`)
        const { data: connection } = await supabase
          .from('whatsapp_connections')
          .select('*')
          .eq('user_id', userId)
          .eq('device_status', 'Connected')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!connection) {
          console.log(`[DEBUG] No connection found for user ${userId}`)
          results.errors.push(`User ${userId}: No active WhatsApp connection`)
          continue
        }
        console.log(`[DEBUG] Connection found for user ${userId}: ${connection.sender_number}`)

        // Get user's default template from settings
        console.log(`[DEBUG] Fetching template for user ${userId}`)
        const { data: settings } = await supabase
          .from('whatsapp_settings')
          .select('default_template')
          .eq('user_id', userId)
          .maybeSingle()

        const template = settings?.default_template || 
          'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂'

        const userResult = {
          user_id: userId,
          sent: 0,
          failed: 0,
        }

        // Send messages to each customer one by one (sequentially)
        console.log(`[DEBUG] Starting to send messages to ${customers.length} customers for user ${userId}`)
        for (let i = 0; i < customers.length; i++) {
          const customer = customers[i]
          console.log(`[DEBUG] Processing customer ${i + 1}/${customers.length}: ${customer.id} - ${customer.name || customer.sender_name}`)
          
          try {
            // Format phone number (ensure it starts with 60)
            let phoneNumber = customer.phone.replace(/[^0-9]/g, '')
            if (!phoneNumber.startsWith('60')) {
              if (phoneNumber.startsWith('0')) {
                phoneNumber = '60' + phoneNumber.substring(1)
              } else {
                phoneNumber = '60' + phoneNumber
              }
            }
            console.log(`[DEBUG] Formatted phone number: ${phoneNumber}`)

            // Replace template variables
            const message = replaceTemplateVariables(template, customer)
            console.log(`[DEBUG] Message prepared: ${message.substring(0, 50)}...`)

            // Send message via WhatsApp API using GET method with query parameters
            const params = new URLSearchParams({
              api_key: connection.api_key,
              sender: connection.sender_number,
              number: phoneNumber,
              message: message,
            })

            console.log(`[DEBUG] Sending message to ${phoneNumber} via API...`)
            // Wait for the fetch call to complete
            const sendResponse = await fetch(`${WHATSAPP_API_ENDPOINT}send-message?${params.toString()}`, {
              method: 'GET',
            })
            console.log(`[DEBUG] API response status: ${sendResponse.status}`)

            // Wait for the response body to be parsed
            const sendResult = await sendResponse.json()
            console.log(`[DEBUG] API response result:`, sendResult)
            const success = sendResponse.ok && sendResult.status !== false
            console.log(`[DEBUG] Message send success: ${success}`)

            // Calculate birthday date (use current year for the birthday date)
            const dob = customer.dob ? new Date(customer.dob) : null
            const currentYear = new Date().getFullYear()
            const birthdayDate = dob 
              ? `${currentYear}-${String(dob.getMonth() + 1).padStart(2, '0')}-${String(dob.getDate()).padStart(2, '0')}`
              : currentDate

            console.log(`[DEBUG] Recording message in database...`)
            // Record message in database
            await supabase
              .from('birthday_messages')
              .insert({
                user_id: userId,
                customer_id: customer.id,
                whatsapp_connection_id: connection.id,
                recipient_number: phoneNumber,
                message_sent: message,
                message_status: success ? 'sent' : 'failed',
                birthday_date: birthdayDate,
                sent_year: currentYear,
              })
            console.log(`[DEBUG] Message recorded in database`)

            if (success) {
              results.sent++
              userResult.sent++
              console.log(`[DEBUG] Message sent successfully. Updating connection count...`)
              // Update connection message count
              await supabase
                .from('whatsapp_connections')
                .update({
                  messages_sent: (connection.messages_sent || 0) + 1,
                })
                .eq('id', connection.id)
              console.log(`[DEBUG] Connection count updated`)
            } else {
              results.failed++
              userResult.failed++
              results.errors.push(`Customer ${customer.id} (User ${userId}): ${sendResult.msg || sendResult.message || 'Failed to send'}`)
              console.log(`[DEBUG] Message send failed: ${sendResult.msg || sendResult.message || 'Unknown error'}`)
            }

            console.log(`[DEBUG] Waiting 1 second before next message...`)
            // Delay between messages to avoid rate limiting (wait 1 second before next message)
            await new Promise(resolve => setTimeout(resolve, 1000))
            console.log(`[DEBUG] Wait complete. Moving to next customer...`)
          } catch (err: any) {
            console.error(`[DEBUG] ERROR in customer loop for customer ${customer.id} (User ${userId}):`, err)
            console.error(`[DEBUG] Error stack:`, err.stack)
            results.failed++
            userResult.failed++
            results.errors.push(`Customer ${customer.id} (User ${userId}): ${err.message}`)
            // Continue to next customer even if one fails
            console.log(`[DEBUG] Continuing to next customer despite error...`)
          }
        }
        console.log(`[DEBUG] Finished processing all ${customers.length} customers for user ${userId}`)

        results.userResults.push(userResult)
        results.processed++
        console.log(`[DEBUG] User ${userId} processing complete. Result: sent=${userResult.sent}, failed=${userResult.failed}`)
      } catch (err: any) {
        console.error(`[DEBUG] ERROR in user loop for user ${userId}:`, err)
        console.error(`[DEBUG] Error stack:`, err.stack)
        results.errors.push(`User ${userId}: ${err.message}`)
      }
    }
    console.log(`[DEBUG] Finished processing all users. Total processed: ${results.processed}`)

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


