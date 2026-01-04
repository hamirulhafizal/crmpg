import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

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
        has_connection: false,
        error: error.message,
      })
    }

    if (!connection) {
      return NextResponse.json({
        connected: false,
        has_connection: false,
      })
    }

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
        api_key: connection.api_key, // Include API key for display
      },
    })
  } catch (error: any) {
    console.error('Error checking connection:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



