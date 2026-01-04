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
    const { connection_id } = body

    if (!connection_id) {
      return NextResponse.json(
        { error: 'connection_id is required' },
        { status: 400 }
      )
    }

    // Get connection
    const { data: connection, error: fetchError } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('id', connection_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      )
    }

    // Call WhatsApp API to disconnect device (if endpoint exists)
    try {
      const response = await fetch(`${WHATSAPP_API_ENDPOINT}disconnect-device`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: connection.api_key,
          sender: connection.sender_number,
        }),
      })

      // Don't fail if disconnect API doesn't exist or fails
      // Just update our database
    } catch (apiError) {
      console.log('Disconnect API call failed (may not be available):', apiError)
    }

    // Update connection status in database
    const { error: updateError } = await supabase
      .from('whatsapp_connections')
      .update({
        device_status: 'Disconnected',
        last_disconnected_at: new Date().toISOString(),
        qr_code_data: null,
        qr_code_expires_at: null,
      })
      .eq('id', connection_id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update connection status' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp disconnected successfully',
    })
  } catch (error: any) {
    console.error('Error disconnecting WhatsApp:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



