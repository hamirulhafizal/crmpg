import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || 'https://ustazai.my/'

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
    const { number, message } = body

    // Get WhatsApp connection
    const { data: connection, error: connectionError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (connectionError || !connection) {
      return NextResponse.json(
        { error: 'WhatsApp connection not found. Please connect your WhatsApp first.' },
        { status: 400 }
      )
    }

    if (!connection.api_key || !connection.sender_number) {
      return NextResponse.json(
        { error: 'API key or sender number not found' },
        { status: 400 }
      )
    }

    // Use provided number or default to sender_number (self-test)
    const recipientNumber = number || connection.sender_number
    const testMessage = message || 'SUCCESS SENT'

    // Format phone number (ensure it starts with 60)
    let phoneNumber = recipientNumber.replace(/[^0-9]/g, '') // Remove non-digits
    if (!phoneNumber.startsWith('60')) {
      if (phoneNumber.startsWith('0')) {
        phoneNumber = '60' + phoneNumber.substring(1)
      } else {
        phoneNumber = '60' + phoneNumber
      }
    }

    // Send message via WhatsApp API using GET method with query parameters
    const params = new URLSearchParams({
      api_key: connection.api_key,
      sender: connection.sender_number,
      number: phoneNumber,
      message: testMessage,
    })
    
    const sendResponse = await fetch(`${WHATSAPP_API_ENDPOINT}send-message?${params.toString()}`, {
      method: 'GET',
    })

    const sendResult = await sendResponse.json()

    // Check if message was sent successfully
    const success = sendResponse.ok && sendResult.status !== false

    return NextResponse.json({
      success: success,
      response: sendResult,
      apiUrl: `${WHATSAPP_API_ENDPOINT}send-message?${params.toString()}`,
      message: success 
        ? 'Test message sent successfully!' 
        : sendResult.message || 'Failed to send test message',
    })
  } catch (error: any) {
    console.error('Error in POST /api/whatsapp/send-test:', error)
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

