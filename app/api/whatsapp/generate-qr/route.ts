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
    const { sender_number, api_key } = body

    if (!sender_number || !api_key) {
      return NextResponse.json(
        { error: 'sender_number and api_key are required' },
        { status: 400 }
      )
    }

    // Validate phone number format (Malaysia: 60123456789)
    if (!/^60\d{9,10}$/.test(sender_number)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be in format: 60123456789' },
        { status: 400 }
      )
    }

    // Call WhatsApp API to generate QR code
    const response = await fetch(`${WHATSAPP_API_ENDPOINT}generate-qr`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        device: sender_number,
        api_key: api_key,
        force: true,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: result.msg || result.message || 'Failed to generate QR code' },
        { status: response.status }
      )
    }

    // Handle different response scenarios
    if (result.status === 'processing') {
      return NextResponse.json({
        status: 'processing',
        message: 'Processing QR code generation. Please try again in a moment.',
      })
    }

    if (result.qrcode) {
      // QR code generated - store in database
      const { data: existingConnection } = await supabase
        .from('whatsapp_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('sender_number', sender_number)
        .single()

      const connectionData = {
        user_id: user.id,
        sender_number,
        api_key,
        device_status: 'Connecting',
        qr_code_data: result.qrcode,
        qr_code_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // 5 minutes expiry
      }

      if (existingConnection) {
        // Update existing connection
        await supabase
          .from('whatsapp_connections')
          .update(connectionData)
          .eq('id', existingConnection.id)
      } else {
        // Create new connection
        await supabase
          .from('whatsapp_connections')
          .insert(connectionData)
      }

      return NextResponse.json({
        status: 'qrcode',
        qrcode: result.qrcode,
        message: result.message || 'Please scan the QR code with your WhatsApp',
      })
    }

    if (result.msg === 'Device already connected!') {
      // Device already connected - update status
      const { data: existingConnection } = await supabase
        .from('whatsapp_connections')
        .select('id')
        .eq('user_id', user.id)
        .eq('sender_number', sender_number)
        .single()

      if (existingConnection) {
        await supabase
          .from('whatsapp_connections')
          .update({
            device_status: 'Connected',
            last_connected_at: new Date().toISOString(),
            qr_code_data: null,
            qr_code_expires_at: null,
          })
          .eq('id', existingConnection.id)
      }

      return NextResponse.json({
        status: 'connected',
        message: 'Device already connected!',
      })
    }

    return NextResponse.json({
      status: 'error',
      message: result.msg || result.message || 'Unknown error',
    })
  } catch (error: any) {
    console.error('Error generating QR code:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

