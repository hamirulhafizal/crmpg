import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

const WHATSAPP_API_ENDPOINT = process.env.WHATSAPP_API_ENDPOINT || 'https://ustazai.my/'

export async function GET(request: Request) {
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

    // Get user's WhatsApp connection (get most recent, even if disconnected)
    const { data: connection, error } = await supabase
      .from('whatsapp_connections')
      .select('id, sender_number, device_status, last_connected_at, last_disconnected_at, messages_sent, api_key, created_at, updated_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Error fetching connection:', error)
      return NextResponse.json({
        connected: false,
        message: 'Error fetching connection',
        error: error.message,
      })
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
        has_connection: false,
        message: 'No WhatsApp connection found',
      })
    }

    // Check device status via API
    try {
      const response = await fetch(
        `${WHATSAPP_API_ENDPOINT}info-device?api_key=${encodeURIComponent(connection.api_key)}&number=${encodeURIComponent(connection.sender_number)}`,
        {
          method: 'GET',
        }
      )

      const apiResult = await response.json()

      if (apiResult.status && apiResult.info && apiResult.info.length > 0) {
        const deviceInfo = apiResult.info[0]
        const isConnected = deviceInfo.status === 'Connected'

        // Update connection status in database
        await supabase
          .from('whatsapp_connections')
          .update({
            device_status: isConnected ? 'Connected' : 'Disconnected',
            last_connected_at: isConnected ? new Date().toISOString() : connection.last_connected_at,
            last_disconnected_at: !isConnected ? new Date().toISOString() : connection.last_disconnected_at,
          })
          .eq('id', connection.id)

        return NextResponse.json({
          connected: isConnected,
          has_connection: true,
          connection: {
            id: connection.id,
            sender_number: connection.sender_number,
            device_status: isConnected ? 'Connected' : 'Disconnected',
            last_connected_at: isConnected ? new Date().toISOString() : connection.last_connected_at,
            last_disconnected_at: !isConnected ? new Date().toISOString() : connection.last_disconnected_at,
            messages_sent: connection.messages_sent,
            api_key: connection.api_key, // Include API key for display (masked in UI)
            device_info: deviceInfo,
          },
        })
      }
    } catch (apiError) {
      console.error('Error checking device status:', apiError)
    }

    // Return database status if API check fails
    return NextResponse.json({
      connected: connection.device_status === 'Connected',
      has_connection: true,
      connection: {
        id: connection.id,
        sender_number: connection.sender_number,
        device_status: connection.device_status,
        last_connected_at: connection.last_connected_at,
        last_disconnected_at: connection.last_disconnected_at,
        messages_sent: connection.messages_sent,
        api_key: connection.api_key, // Include API key for display (masked in UI)
      },
    })
  } catch (error: any) {
    console.error('Error checking WhatsApp status:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}


