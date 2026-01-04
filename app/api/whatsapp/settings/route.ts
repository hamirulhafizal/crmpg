import { NextResponse } from 'next/server'
import { createClient } from '@/app/lib/supabase/server'

// GET /api/whatsapp/settings - Get user's WhatsApp settings
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

    // Get user's settings
    const { data: settings, error } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error && error.code !== 'PGRST116') {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    // Return default settings if none exist
    if (!settings) {
      return NextResponse.json({
        auto_send_enabled: true,
        send_time: '08:00:00',
        timezone: 'Asia/Kuala_Lumpur',
        default_template: 'Selamat Hari Jadi, {SenderName}! Semoga panjang umur, murah rezeki, dan bahagia selalu! 🎉🎂',
      })
    }

    return NextResponse.json(settings)
  } catch (error: any) {
    console.error('Error fetching WhatsApp settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/whatsapp/settings - Update user's WhatsApp settings
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
    const { auto_send_enabled, send_time, timezone, default_template } = body

    // Check if settings exist
    const { data: existingSettings } = await supabase
      .from('whatsapp_settings')
      .select('id')
      .eq('user_id', user.id)
      .single()

    const settingsData: any = {}
    if (auto_send_enabled !== undefined) settingsData.auto_send_enabled = auto_send_enabled
    if (send_time !== undefined) settingsData.send_time = send_time
    if (timezone !== undefined) settingsData.timezone = timezone
    if (default_template !== undefined) settingsData.default_template = default_template

    let result
    if (existingSettings) {
      // Update existing settings
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .update(settingsData)
        .eq('id', existingSettings.id)
        .select()
        .single()
      
      result = { data, error }
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .insert({
          user_id: user.id,
          ...settingsData,
        })
        .select()
        .single()
      
      result = { data, error }
    }

    if (result.error) {
      return NextResponse.json(
        { error: result.error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      settings: result.data,
    })
  } catch (error: any) {
    console.error('Error updating WhatsApp settings:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    )
  }
}



