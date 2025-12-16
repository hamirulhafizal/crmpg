import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// DELETE /api/whatsapp/connection - Delete WhatsApp connection
export async function DELETE(request: Request) {
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

    // Get user's WhatsApp connection
    const { data: connection, error: fetchError } = await supabase
      .from('whatsapp_connections')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch connection' },
        { status: 500 }
      )
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'No connection found to delete' },
        { status: 404 }
      )
    }

    // Delete the connection
    const { error: deleteError } = await supabase
      .from('whatsapp_connections')
      .delete()
      .eq('id', connection.id)
      .eq('user_id', user.id)

    if (deleteError) {
      return NextResponse.json(
        { error: 'Failed to delete connection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'WhatsApp connection deleted successfully',
    })
  } catch (error: any) {
    console.error('Error deleting connection:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/whatsapp/connection - Update WhatsApp connection (API key or phone number)
export async function PUT(request: Request) {
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

    // At least one field must be provided
    if (!sender_number && !api_key) {
      return NextResponse.json(
        { error: 'At least one of sender_number or api_key is required' },
        { status: 400 }
      )
    }

    // Validate phone number format if provided
    if (sender_number && !/^60\d{9,10}$/.test(sender_number)) {
      return NextResponse.json(
        { error: 'Invalid phone number format. Must be in format: 60123456789' },
        { status: 400 }
      )
    }

    // Get user's WhatsApp connection
    const { data: connection, error: fetchError } = await supabase
      .from('whatsapp_connections')
      .select('id, sender_number, api_key')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (fetchError) {
      return NextResponse.json(
        { error: 'Failed to fetch connection' },
        { status: 500 }
      )
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'No connection found to update' },
        { status: 404 }
      )
    }

    // Prepare update data
    const updateData: any = {}
    if (sender_number && sender_number !== connection.sender_number) {
      updateData.sender_number = sender_number
    }
    if (api_key && api_key !== connection.api_key) {
      updateData.api_key = api_key
    }

    // If nothing to update
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No changes detected',
        connection: {
          id: connection.id,
          sender_number: connection.sender_number,
          api_key: connection.api_key,
        },
      })
    }

    // Update the connection
    const { data: updatedConnection, error: updateError } = await supabase
      .from('whatsapp_connections')
      .update(updateData)
      .eq('id', connection.id)
      .eq('user_id', user.id)
      .select('id, sender_number, device_status, api_key')
      .single()

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update connection' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Connection updated successfully',
      connection: updatedConnection,
    })
  } catch (error: any) {
    console.error('Error updating connection:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
